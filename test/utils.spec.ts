import { equal } from 'node:assert/strict';
import { escapeXmlAttribute, tag } from '../lib/utils';

describe('utils', function () {
    describe('escapeXmlAttribute', function () {
        it('should properly escape the string', function () {
            const input = `This is a "test" & it's <unsafe>`;
            const expected = 'This is a &quot;test&quot; &amp; it&apos;s &lt;unsafe&gt;';
            const actual = escapeXmlAttribute(input);
            equal(actual, expected);
        });
    });

    describe('tag', function () {
        it('should generate a self-closing tag without attributes', function () {
            const result = tag('br', {}, true);
            equal(result, '<br/>');
        });

        it('should generate a self-closing tag with attributes', function () {
            const result = tag('img', { src: 'image.png', alt: 'An image' }, true);
            equal(result, '<img src="image.png" alt="An image"/>');
        });

        it('should generate a non-self-closing tag without content', function () {
            const result = tag('div', { class: 'container' }, false);
            equal(result, '<div class="container">');
        });

        it('should generate a non-self-closing tag with content', function () {
            const result = tag('p', { class: 'text' }, false, 'Hello, world!');
            equal(result, '<p class="text">Hello, world!</p>');
        });

        it('should escape special characters in attributes', function () {
            const result = tag(
                'a',
                { href: 'https://example.com?param=1&other=<value>', title: 'A "link"' },
                false,
                'Click here',
            );
            equal(
                result,
                '<a href="https://example.com?param=1&amp;other=&lt;value&gt;" title="A &quot;link&quot;">Click here</a>',
            );
        });
    });
});
