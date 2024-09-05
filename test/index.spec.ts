/* eslint-disable sonarjs/no-nested-functions */
/* eslint-disable sonarjs/constructor-for-side-effects */
import { deepEqual, equal, match, throws } from 'node:assert/strict';
import fs from 'node:fs';
import { mock } from 'node:test';
import Mocha from 'mocha';
import { DOMParser, type Document, Element, type NodeList } from '@xmldom/xmldom';
import { WritableBufferStream } from '@myrotvorets/buffer-stream';
import Reporter from '../lib';

function extractElements(list: NodeList): Element[] {
    const result: Element[] = [];
    for (let i = 0; i < list.length; ++i) {
        const node = list.item(i)!;
        if (node instanceof Element) {
            result.push(node);
        }
    }

    return result;
}

declare module '@xmldom/xmldom' {
    interface Document {
        documentElement: Element;
    }
}

function checkDocumentStructure(doc: Document): void {
    equal(doc.documentElement.localName, 'testExecutions');
    equal(doc.documentElement.attributes.length, 1);
    equal(doc.documentElement.getAttribute('version'), '1');

    const files = extractElements(doc.documentElement.childNodes);
    files.forEach((element) => {
        equal(element.localName, 'file');
        equal(element.attributes.length, 1);
        const path = element.getAttribute('path');
        equal(typeof path, 'string');
        equal(path!.length > 0, true);
        equal(element.childNodes.length > 0, true);

        const testCases = extractElements(element.childNodes);
        testCases.forEach((element) => {
            equal(element.localName, 'testCase');
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
                match(child.localName!, /^(failure|skipped)$/u);
                equal(child.attributes.length, 0);
            }
        });
    });
}

describe('SonarQubeReporter', function () {
    let context: Mocha.Context;
    let suite: Mocha.Suite;
    let runner: Mocha.Runner;
    let stream: WritableBufferStream;

    beforeEach(function () {
        stream = new WritableBufferStream();
        context = new Mocha.Context();
        suite = new Mocha.Suite('Test Suite', context);
        runner = new Mocha.Runner(suite, { delay: false });
        new Reporter(/* NOSONAR */ runner, {
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
            const doc = parser.parseFromString(xml, 'application/xml');
            checkDocumentStructure(doc);

            const fileNodes = doc.getElementsByTagName('file');
            const fileNames: string[] = [];
            for (let i = 0; i < fileNodes.length; ++i) {
                fileNames.push((fileNodes.item(i) as Element).getAttribute('path') ?? '');
            }

            deepEqual(fileNames, ['/some/file.js', '/some/otherfile.js', '/yet/another/file.js']);
            equal((fileNodes[0] as Element).getElementsByTagName('testCase').length, 2);
            equal((fileNodes[1] as Element).getElementsByTagName('testCase').length, 1);
            equal((fileNodes[2] as Element).getElementsByTagName('testCase').length, 1);

            const testCases = doc.getElementsByTagName('testCase');
            equal(testCases.length, 4);

            const testNames: string[] = [];
            for (let i = 0; i < testCases.length; ++i) {
                testNames.push((testCases.item(i) as Element).getAttribute('name') ?? '');
            }

            deepEqual(testNames, [
                'Test Suite » Successful Test',
                'Test Suite » Failed Test',
                'Test Suite » Skipped Test',
                'Test Suite » Pending Test',
            ]);

            equal((testCases[0] as Element).getElementsByTagName('*').length, 0);
            equal((testCases[1] as Element).getElementsByTagName('*').length, 1);
            equal((testCases[2] as Element).getElementsByTagName('*').length, 1);
            equal((testCases[3] as Element).getElementsByTagName('*').length, 1);

            equal((testCases[1] as Element).getElementsByTagName('failure').length, 1);
            equal((testCases[2] as Element).getElementsByTagName('skipped').length, 1);
            equal((testCases[3] as Element).getElementsByTagName('skipped').length, 1);

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
            const doc = parser.parseFromString(xml, 'application/xml');
            checkDocumentStructure(doc);

            equal(doc.getElementsByTagName('file').length, 0);
            done();
        });
    });

    describe('report handling', function () {
        afterEach(function () {
            mock.restoreAll();
        });

        it('should create parent directories for report', function () {
            const statSyncMock = mock.method(fs, 'statSync', () => undefined);
            const mkdirSyncMock = mock.method(fs, 'mkdirSync', () => undefined);
            const createWriteStreamMock = mock.method(fs, 'createWriteStream', () => new WritableBufferStream());

            const dirname = 'some/path/to';
            const filename = `${dirname}/report.xml`;

            new Reporter(/* NOSONAR */ runner, {
                reporterOptions: {
                    filename,
                },
            });

            equal(statSyncMock.mock.calls.length, 1);
            equal(statSyncMock.mock.calls[0]?.arguments[0], dirname);
            equal(mkdirSyncMock.mock.calls.length, 1);
            equal(mkdirSyncMock.mock.calls[0]?.arguments[0], dirname);
            equal(createWriteStreamMock.mock.calls.length, 1);
            equal(createWriteStreamMock.mock.calls[0]?.arguments[0], filename);
        });

        it('does not call mkdir if parent directory exists', function () {
            const statSyncMock = mock.method(fs, 'statSync', () => ({ isDirectory: (): boolean => true }));
            const mkdirSyncMock = mock.method(fs, 'mkdirSync', () => undefined);
            const createWriteStreamMock = mock.method(fs, 'createWriteStream', () => new WritableBufferStream());

            const dirname = 'some/path/to';
            const filename = `${dirname}/report.xml`;

            new Reporter(/* NOSONAR */ runner, {
                reporterOptions: {
                    filename,
                },
            });

            equal(statSyncMock.mock.calls.length, 1);
            equal(statSyncMock.mock.calls[0]?.arguments[0], dirname);
            equal(mkdirSyncMock.mock.calls.length, 0);
            equal(createWriteStreamMock.mock.calls.length, 1);
            equal(createWriteStreamMock.mock.calls[0]?.arguments[0], filename);
        });

        it('should throw if parent directory is not a directory', function () {
            const statSyncMock = mock.method(fs, 'statSync', () => ({ isDirectory: (): boolean => false }));
            const mkdirSyncMock = mock.method(fs, 'mkdirSync', () => undefined);
            const createWriteStreamMock = mock.method(fs, 'createWriteStream', () => new WritableBufferStream());

            const dirname = 'some/path/to';
            const filename = `${dirname}/report.xml`;

            throws(() => {
                new Reporter(/* NOSONAR */ runner, {
                    reporterOptions: {
                        filename,
                    },
                });
            }, /^Error: ".+" is not a directory$/u);

            equal(statSyncMock.mock.calls.length, 1);
            equal(statSyncMock.mock.calls[0]?.arguments[0], dirname);
            equal(mkdirSyncMock.mock.calls.length, 0);
            equal(createWriteStreamMock.mock.calls.length, 0);
        });
    });
});
