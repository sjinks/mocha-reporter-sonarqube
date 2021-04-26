import mocha from 'mocha';
import { createWriteStream } from 'fs';
import { Writable } from 'stream';
import { DOMImplementation, XMLSerializer } from 'xmldom';

interface SonarQubeReporterOptions {
    stream: Writable | undefined;
    filename: string | undefined;
}

class SonarQubeReporter extends mocha.reporters.Base {
    private tests: Record<string, mocha.Test[]> = {};
    private readonly options: SonarQubeReporterOptions;

    public constructor(runner: mocha.Runner, options?: mocha.MochaOptions) {
        super(runner, options);

        // istanbul ignore else
        if (options && options.reporterOptions && typeof options.reporterOptions === 'object') {
            const reporterOptions = options.reporterOptions as SonarQubeReporterOptions;
            this.options = {
                stream: reporterOptions.stream,
                filename: reporterOptions.filename,
            };
        } else {
            this.options = {
                stream: undefined,
                filename: undefined,
            };
        }

        // istanbul ignore if
        if (!this.options.stream || !(this.options.stream instanceof Writable)) {
            if (this.options.filename) {
                this.options.stream = createWriteStream(this.options.filename, { encoding: 'utf-8', mode: 0o644 });
            } else {
                this.options.stream = process.stdout;
            }
        }

        runner.on('start', this._onStart);
        runner.on('test end', this._onTestEnd);
        runner.on('fail', this._onFailedTest);
        runner.on('end', this._onEnd);
        this.options.stream.on('error', this._onStreamError);
    }

    // istanbul ignore next
    private readonly _onStreamError = (e: Error): void => {
        console.error(e);
    };

    private readonly _onStart = (): void => {
        this.tests = {};
    };

    private readonly _onTestEnd = (test: mocha.Test): void => {
        const { file } = test;
        if (file !== undefined) {
            if (this.tests[file] === undefined) {
                this.tests[file] = [];
            }

            this.tests[file].push(test);
        }
    };

    private readonly _onFailedTest = (test: mocha.Test, err: Error): void => {
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
            const tests = this.tests[fileName];
            const file = doc.createElement('file');
            file.setAttribute('path', fileName);
            testExecutions.appendChild(file);
            tests.forEach((test) => file.appendChild(SonarQubeReporter._generateTestCaseTag(doc, test)));
        });

        const serializer = new XMLSerializer();
        (this.options.stream as Writable).write(serializer.serializeToString(doc));
    };

    private static _generateTestCaseTag(doc: XMLDocument, test: mocha.Test): HTMLElement {
        const testCase = doc.createElement('testCase');
        testCase.setAttribute('name', test.titlePath().join(' » '));
        testCase.setAttribute('duration', /* istanbul ignore next */ test.duration ? test.duration.toFixed() : '0');
        if (test.state === 'passed') {
            // Do nothing
        } else if (test.state === 'failed') {
            const failure = doc.createElement('failure');
            failure.setAttribute('message', /* istanbul ignore next */ test.err?.message || '');
            failure.appendChild(doc.createTextNode(/* istanbul ignore next */ test.err?.stack || ''));
            testCase.appendChild(failure);
        } /* istanbul ignore else */ else if (test.state === 'pending') {
            const skipped = doc.createElement('skipped');
            skipped.setAttribute('message', 'Pending test');
            testCase.appendChild(skipped);
        }

        return testCase;
    }
}

export = SonarQubeReporter;
