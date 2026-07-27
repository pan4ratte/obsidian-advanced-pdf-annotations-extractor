import {describe, expect, test} from '@jest/globals';
import {assignTopics, takeTopicForNoteName} from '../src/topics';
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

describe('takeTopicForNoteName', () => {
  /** An annotation as `assignTopics` leaves it, grouped by topic or not. */
  const prepared = (body: string, grouped: boolean) => {
    const anno = annotation(body);
    assignTopics([anno], grouped);
    return anno;
  };

  test('gives back the topic to name the note with', () => {
    const anno = prepared('Method notes\r\nand the detail', true);
    expect(takeTopicForNoteName(anno, false)).toBe('Method notes');
  });

  test('leaves nothing for the note to write the topic from', () => {
    const anno = prepared('Method notes\r\nand the detail', true);
    takeTopicForNoteName(anno, false);
    // Empty rather than undefined: the formatter writes no heading for it and
    // a {{topic}} in a template renders nothing.
    expect(anno.topic).toBe('');
    expect(anno.body).toBe('and the detail');
  });

  test('takes the line out of the body when the grouping has not', () => {
    const anno = prepared('Method notes\r\nand the detail', false);
    expect(takeTopicForNoteName(anno, true)).toBe('Method notes');
    expect(anno.body).toBe('and the detail');
  });

  test('leaves a body the topic is no longer the first line of', () => {
    // What taking the tags out leaves behind when the first line held only
    // them: the line is gone and the topic with it.
    const anno = annotation('and the detail');
    anno.topic = '';
    expect(takeTopicForNoteName(anno, true)).toBe('');
    expect(anno.body).toBe('and the detail');
  });

  test('leaves a body whose first line is not the topic alone', () => {
    const anno = annotation('a shortened line');
    anno.topic = 'a line that was shortened since';
    takeTopicForNoteName(anno, true);
    expect(anno.body).toBe('a shortened line');
  });

  test('an annotation of one line leaves an empty note behind', () => {
    const anno = prepared('Method notes', false);
    expect(takeTopicForNoteName(anno, true)).toBe('Method notes');
    expect(anno.body).toBe('');
  });
});
