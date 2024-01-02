import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { Writable } from 'node:stream';
import { type MochaOptions, type Runner, type Test, reporters } from 'mocha';
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';

class SonarQubeReporter extends reporters.Base {
    private tests: Record<string, Test[]> = {};
    private readonly stream: Writable = process.stdout;

    public constructor(runner: Runner, options?: MochaOptions) {
        super(runner, options);

        const reporterOptions: unknown = options?.reporterOptions;
        // istanbul ignore else
        if (reporterOptions && typeof reporterOptions === 'object') {
            const { stream, filename } = reporterOptions as Record<string, unknown>;
            // istanbul ignore if
            if (!(stream instanceof Writable)) {
                this.stream =
                    filename && typeof filename === 'string'
                        ? SonarQubeReporter.createWriteStream(filename)
                        : process.stdout;
            } else {
                this.stream = stream;
            }
        }

        runner.on('start', this._onStart);
        runner.on('test end', this._onTestEnd);
        runner.on('fail', this._onFailedTest);
        runner.on('end', this._onEnd);
        this.stream.on('error', this._onStreamError);
    }

    // istanbul ignore next
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    private readonly _onStreamError = (e: Error): void => {
        console.error(e);
        throw e;
    };

    private readonly _onStart = (): void => {
        this.tests = {};
    };

    private readonly _onTestEnd = (test: Test): void => {
        const { file } = test;
        if (file !== undefined) {
            this.tests[file] = this.tests[file] ?? [];
            this.tests[file]!.push(test);
        }
    };

    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    private readonly _onFailedTest = (test: Test, err: Error): void => {
        test.err = err;
    };

    private readonly _onEnd = (): void => {
        const dom = new DOMImplementation();
        const doc = dom.createDocument(null, null);
        const xmlPI = doc.createProcessingInstruction('xml', 'version="1.0" encoding="UTF-8"');
        const testExecutions = doc.createElement('testExecutions');
        testExecutions.setAttribute('version', '1');
        doc.appendChild(xmlPI);
        doc.appendChild(doc.createTextNode('\n'));
        doc.appendChild(testExecutions);

        Object.keys(this.tests).forEach((fileName) => {
            const tests = this.tests[fileName]!;
            const file = doc.createElement('file');
            file.setAttribute('path', fileName);
            testExecutions.appendChild(file);
            tests.forEach((test) => file.appendChild(SonarQubeReporter._generateTestCaseTag(doc, test)));
        });

        const serializer = new XMLSerializer();
        this.stream.write(serializer.serializeToString(doc));
    };

    private static _generateTestCaseTag(doc: XMLDocument, test: Test): HTMLElement {
        const testCase = doc.createElement('testCase');
        testCase.setAttribute('name', test.titlePath().join(' » '));
        testCase.setAttribute('duration', /* istanbul ignore next */ test.duration ? test.duration.toFixed() : '0');
        if (test.state === 'passed') {
            // Do nothing
        } else if (test.state === 'failed') {
            const failure = doc.createElement('failure');
            failure.setAttribute('message', /* istanbul ignore next */ test.err?.message ?? '');
            failure.appendChild(doc.createTextNode(/* istanbul ignore next */ test.err?.stack ?? ''));
            testCase.appendChild(failure);
        } else if (test.state === 'pending') {
            const skipped = doc.createElement('skipped');
            skipped.setAttribute('message', 'Pending test');
            testCase.appendChild(skipped);
        }

        return testCase;
    }

    private static createWriteStream(filename: string): Writable {
        const dir = dirname(filename);
        const stats = statSync(dir, { throwIfNoEntry: false });
        if (stats === undefined) {
            mkdirSync(dir, { recursive: true, mode: 0o755 });
        } else if (!stats.isDirectory()) {
            throw new Error(`"${dir}" is not a directory`);
        }

        return createWriteStream(filename, { encoding: 'utf-8', mode: 0o644 });
    }
}

export = SonarQubeReporter;
