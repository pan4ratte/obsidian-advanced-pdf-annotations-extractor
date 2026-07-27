import {describe, expect, test} from '@jest/globals';
import {assignTopics} from '../src/topics';
import {PDFAnnotation} from '../src/types';

/** Only the body a topic is read from is of any interest here. */
const annotation = (body: string) => ({body} as PDFAnnotation);

describe('assignTopics', () => {
  test('grouping by topic takes the first line out of the body', () => {
    const anno = annotation('Method notes\r\nand the detail');
    assignTopics([anno], true);
    expect(anno.topic).toBe('Method notes');
    expect(anno.body).toBe('and the detail');
  });

  test('without the grouping the topic is read all the same', () => {
    const anno = annotation('Method notes\r\nand the detail');
    assignTopics([anno], false);
    expect(anno.topic).toBe('Method notes');
  });

  test('without the grouping the comment is left whole', () => {
    const written = 'Method notes\r\nand the detail';
    const anno = annotation(written);
    assignTopics([anno], false);
    expect(anno.body).toBe(written);
  });

  test('a comment of one line is all topic when grouped by it', () => {
    const anno = annotation('Method notes');
    assignTopics([anno], true);
    expect(anno.topic).toBe('Method notes');
    expect(anno.body).toBe('');
  });

  test('an annotation with no comment has no topic to speak of', () => {
    const anno = annotation('');
    assignTopics([anno], false);
    expect(anno.topic).toBe('');
  });

  test('every line ending a PDF may use is a line ending', () => {
    for (const ending of ['\r\n', '\n\r', '\n', '\r']) {
      const anno = annotation(`Method notes${ending}and the detail`);
      assignTopics([anno], true);
      expect(anno.topic).toBe('Method notes');
      expect(anno.body).toBe('and the detail');
    }
  });

  test('every annotation is given its own topic', () => {
    const annotations = [annotation('First\nx'), annotation('Second\ny')];
    assignTopics(annotations, true);
    expect(annotations.map((a) => a.topic)).toEqual(['First', 'Second']);
  });
});
