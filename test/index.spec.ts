import Mocha from 'mocha';
import { expect } from 'chai';
import { DOMParser } from '@xmldom/xmldom';
import { WritableBufferStream } from '@myrotvorets/buffer-stream';
import Reporter from '../lib';

function isElement(node: Node): node is Element {
    return node.nodeType === 3;
}

function extractElements(list: NodeList): Element[] {
    const result: Element[] = [];
    for (let i = 0; i < list.length; ++i) {
        const node = list.item(i) as Node;
        if (isElement(node)) {
            result.push(node);
        }
    }

    return result;
}

function checkDocumentStructure(doc: XMLDocument): void {
    expect(doc.documentElement.tagName).to.equal('testExecutions');
    expect(doc.documentElement.attributes.length).to.equal(1);
    expect(doc.documentElement.getAttribute('version')).to.equal('1');

    const files = extractElements(doc.documentElement.childNodes);
    files.forEach((element) => {
        expect(element.tagName).to.equal('file');
        expect(element.attributes.length).to.equal(1);
        expect(element.getAttribute('path')).to.be.not.empty('string');
        expect(element.childNodes.length).to.be.greaterThan(0);

        const testCases = extractElements(element.childNodes);
        testCases.forEach((element) => {
            expect(element.tagName).to.equal('testCase');
            expect(element.attributes.length).to.equal(2);
            expect(element.getAttribute('name')).to.be.not.empty('string');
            expect(element.getAttribute('duration')).to.be.not.empty('string');

            const children = extractElements(element.childNodes);
            expect(children).to.have.length.at.most(1);
            if (children.length) {
                const child = children[0] as Element;
                expect(child.tagName).to.match(/^(failure|skipped)$/u);
                expect(child.attributes.length).to.equal(1);
                expect(child.getAttribute('message')).to.be.not.empty('string');

                if (child.tagName === 'failure') {
                    expect(child.childNodes.length).to.be.greaterThan(0);
                } else {
                    expect(child.childNodes.length).to.equal(0);
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
        // @ts-ignore
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
            expect(failureCount).to.equal(1);

            const parser = new DOMParser();
            const xml = stream.toString();
            const doc = parser.parseFromString(xml);
            checkDocumentStructure(doc);

            const fileNodes = doc.getElementsByTagName('file');
            const fileNames: string[] = [];
            for (let i = 0; i < fileNodes.length; ++i) {
                fileNames.push((fileNodes.item(i) as Element).getAttribute('path') as string);
            }

            expect(fileNames).to.deep.equal(['/some/file.js', '/some/otherfile.js', '/yet/another/file.js']);
            expect((fileNodes[0] as Element).getElementsByTagName('testCase')).to.have.length(2);
            expect((fileNodes[1] as Element).getElementsByTagName('testCase')).to.have.length(1);
            expect((fileNodes[2] as Element).getElementsByTagName('testCase')).to.have.length(1);

            const testCases = doc.getElementsByTagName('testCase');
            expect(testCases).to.have.length(4);

            const testNames: string[] = [];
            for (let i = 0; i < testCases.length; ++i) {
                testNames.push((testCases.item(i) as Element).getAttribute('name') as string);
            }

            expect(testNames).to.deep.equal([
                'Test Suite » Successful Test',
                'Test Suite » Failed Test',
                'Test Suite » Skipped Test',
                'Test Suite » Pending Test',
            ]);

            expect((testCases[0] as Element).getElementsByTagName('*')).to.have.length(0);
            expect((testCases[1] as Element).getElementsByTagName('*')).to.have.length(1);
            expect((testCases[2] as Element).getElementsByTagName('*')).to.have.length(1);
            expect((testCases[3] as Element).getElementsByTagName('*')).to.have.length(1);

            expect((testCases[1] as Element).getElementsByTagName('failure')).to.have.length(1);
            expect((testCases[2] as Element).getElementsByTagName('skipped')).to.have.length(1);
            expect((testCases[3] as Element).getElementsByTagName('skipped')).to.have.length(1);

            done();
        });
    });

    it('should skip tests without files', function (done) {
        const test = new Mocha.Test('Test', (done) => done());
        suite.addTest(test);

        runner.run(function (failureCount) {
            expect(failureCount).to.equal(0);

            const parser = new DOMParser();
            const xml = stream.toString();
            const doc = parser.parseFromString(xml);
            checkDocumentStructure(doc);

            expect(doc.getElementsByTagName('file')).to.have.length(0);
            done();
        });
    });
});
