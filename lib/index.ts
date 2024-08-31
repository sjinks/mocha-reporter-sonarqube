import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { Writable } from 'node:stream';
import { type MochaOptions, Runner, type Test, reporters } from 'mocha';
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

        runner.on(Runner.constants.EVENT_RUN_BEGIN, this._onStart);
        runner.on(Runner.constants.EVENT_TEST_END, this._onTestEnd);
        runner.on(Runner.constants.EVENT_RUN_END, this._onEnd);
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
            this.tests[file].push(test);
        }
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
        if (test.state === 'failed') {
            testCase.appendChild(doc.createElement('failure'));
        } else if (test.state === 'pending') {
            testCase.appendChild(doc.createElement('skipped'));
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
