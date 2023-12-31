import { deepEqual, equal, match } from 'node:assert/strict';
import Mocha from 'mocha';
import { DOMParser } from '@xmldom/xmldom';
import { WritableBufferStream } from '@myrotvorets/buffer-stream';
import Reporter from '../lib';

function isElement(node: Node): node is Element {
    return node.nodeType === 3;
}

function extractElements(list: NodeList): Element[] {
    const result: Element[] = [];
    for (let i = 0; i < list.length; ++i) {
        const node = list.item(i)!;
        if (isElement(node)) {
            result.push(node);
        }
    }

    return result;
}

function checkDocumentStructure(doc: XMLDocument): void {
    equal(doc.documentElement.tagName, 'testExecutions');
    equal(doc.documentElement.attributes.length, 1);
    equal(doc.documentElement.getAttribute('version'), '1');

    const files = extractElements(doc.documentElement.childNodes);
    files.forEach((element) => {
        equal(element.tagName, 'file');
        equal(element.attributes.length, 1);
        const path = element.getAttribute('path');
        equal(typeof path, 'string');
        equal(path!.length > 0, true);
        equal(element.childNodes.length > 0, true);

        const testCases = extractElements(element.childNodes);
        testCases.forEach((element) => {
            equal(element.tagName, 'testCase');
            equal(element.attributes.length, 2);
            const name = element.getAttribute('name');
            const duration = element.getAttribute('duration');

            equal(typeof name, 'string');
            equal(typeof duration, 'string');
            equal(name!.length > 0, true);
            equal(duration!.length > 0, true);

            const children = extractElements(element.childNodes);
            equal(children.length <= 1, true);
            if (children.length) {
                const child = children[0]!;
                match(child.tagName, /^(failure|skipped)$/u);
                equal(child.attributes.length, 1);
                const message = child.getAttribute('message');
                equal(typeof message, 'string');
                equal(message!.length > 0, true);

                if (child.tagName === 'failure') {
                    equal(child.childNodes.length > 0, true);
                } else {
                    equal(child.childNodes.length, 0);
                }
            }
        });
    });
}

describe('SonarQubeReporter', function () {
    let mocha: Mocha;
    let context: Mocha.Context;
    let suite: Mocha.Suite;
    let runner: Mocha.Runner;
    let stream: WritableBufferStream;

    beforeEach(function () {
        stream = new WritableBufferStream();
        mocha = new Mocha({
            reporter: Reporter,
            reporterOptions: {
                stream,
            },
        });
        context = new Mocha.Context();
        suite = new Mocha.Suite('Test Suite', context);
        runner = new Mocha.Runner(suite, { delay: false });

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        new mocha._reporter(runner, {
            reporterOptions: {
                stream,
            },
        });
    });

    it('should pass overall check', function (done) {
        const successfullTest = new Mocha.Test('Successful Test', (done) => done());
        successfullTest.file = '/some/file.js';

        const failedTest = new Mocha.Test('Failed Test', (done) => done(new Error('Something bad happened')));
        failedTest.file = '/some/file.js';

        const skippedTest = new Mocha.Test('Skipped Test', function (this: Mocha.Context) {
            this.skip();
        });
        skippedTest.file = '/some/otherfile.js';

        const pendingTest = new Mocha.Test('Pending Test');
        pendingTest.file = '/yet/another/file.js';

        suite.addTest(successfullTest);
        suite.addTest(failedTest);
        suite.addTest(skippedTest);
        suite.addTest(pendingTest);

        runner.run(function (failureCount) {
            equal(failureCount, 1);

            const parser = new DOMParser();
            const xml = stream.toString();
            const doc = parser.parseFromString(xml);
            checkDocumentStructure(doc);

            const fileNodes = doc.getElementsByTagName('file');
            const fileNames: string[] = [];
            for (let i = 0; i < fileNodes.length; ++i) {
                fileNames.push(fileNodes.item(i)!.getAttribute('path')!);
            }

            deepEqual(fileNames, ['/some/file.js', '/some/otherfile.js', '/yet/another/file.js']);
            equal(fileNodes[0]!.getElementsByTagName('testCase').length, 2);
            equal(fileNodes[1]!.getElementsByTagName('testCase').length, 1);
            equal(fileNodes[2]!.getElementsByTagName('testCase').length, 1);

            const testCases = doc.getElementsByTagName('testCase');
            equal(testCases.length, 4);

            const testNames: string[] = [];
            for (let i = 0; i < testCases.length; ++i) {
                testNames.push(testCases.item(i)!.getAttribute('name')!);
            }

            deepEqual(testNames, [
                'Test Suite » Successful Test',
                'Test Suite » Failed Test',
                'Test Suite » Skipped Test',
                'Test Suite » Pending Test',
            ]);

            equal(testCases[0]!.getElementsByTagName('*').length, 0);
            equal(testCases[1]!.getElementsByTagName('*').length, 1);
            equal(testCases[2]!.getElementsByTagName('*').length, 1);
            equal(testCases[3]!.getElementsByTagName('*').length, 1);

            equal(testCases[1]!.getElementsByTagName('failure').length, 1);
            equal(testCases[2]!.getElementsByTagName('skipped').length, 1);
            equal(testCases[3]!.getElementsByTagName('skipped').length, 1);

            done();
        });
    });

    it('should skip tests without files', function (done) {
        const test = new Mocha.Test('Test', (done) => done());
        suite.addTest(test);

        runner.run(function (failureCount) {
            equal(failureCount, 0);

            const parser = new DOMParser();
            const xml = stream.toString();
            const doc = parser.parseFromString(xml);
            checkDocumentStructure(doc);

            equal(doc.getElementsByTagName('file').length, 0);
            done();
        });
    });
});
