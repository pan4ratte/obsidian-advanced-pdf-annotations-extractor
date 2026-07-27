import {describe, expect, test} from '@jest/globals';
import {takeTagsFromAnnotations} from '../src/tags';
import {PDFAnnotation} from '../src/types';

/** Only the two fields the tags are read from are of any interest here. */
const annotation = (body: string, topic?: string) =>
  ({body, topic} as PDFAnnotation);

describe('takeTagsFromAnnotations', () => {
  test('reads the tags out of a comment', () => {
    expect(takeTagsFromAnnotations([annotation('Worth a look #method #to-read')]))
      .toEqual(['method', 'to-read']);
  });

  test('reads the tags out of the topic, which sorting by topic moves them to', () => {
    // What `sort()` leaves behind for a one line comment of 'Method #ml'.
    expect(takeTagsFromAnnotations([annotation('', 'Method #ml')]))
      .toEqual(['ml']);
  });

  test('reads a topic and a body together', () => {
    expect(takeTagsFromAnnotations([
      annotation('and the rest #later', 'Method #ml'),
    ])).toEqual(['ml', 'later']);
  });

  test('the same tag written twice is one tag', () => {
    expect(takeTagsFromAnnotations([
      annotation('#ml here', 'Method #ml'),
      annotation('#ml again'),
    ])).toEqual(['ml']);
  });

  test('nested tags keep their path', () => {
    expect(takeTagsFromAnnotations([annotation('#reading/papers')]))
      .toEqual(['reading/papers']);
  });

  test('a tag is read in whatever script it was written in', () => {
    // A comment as it comes out of a PDF read in Russian: the title on the
    // first line, the tags under it.
    const anno = annotation(
      '#ключевое #линдбек-джодж #методология',
      '452 - For Lindbeck doctrine is the grammar of religion'
    );
    expect(takeTagsFromAnnotations([anno]))
      .toEqual(['ключевое', 'линдбек-джодж', 'методология']);
    expect(anno.body).toBe('');
  });

  test('a tag of one script mixed into another is read too', () => {
    expect(takeTagsFromAnnotations([annotation('See #Grundriß and #思想')]))
      .toEqual(['Grundriß', '思想']);
  });

  test('a number is not a tag', () => {
    expect(takeTagsFromAnnotations([annotation('see #1 and #2b')]))
      .toEqual(['2b']);
  });

  test('a comment with no tags yields none', () => {
    expect(takeTagsFromAnnotations([annotation('nothing to say', 'A topic')]))
      .toEqual([]);
  });
});

describe('the tags a note keeps in its text', () => {
  test('none: a tag read into the properties is taken out of the comment', () => {
    const anno = annotation('Worth a look #method', 'Method notes #ml');
    takeTagsFromAnnotations([anno]);
    expect(anno.topic).toBe('Method notes');
    expect(anno.body).toBe('Worth a look');
  });

  test('a tag written first leaves no gap in front of the line', () => {
    const anno = annotation('#method worth a look');
    takeTagsFromAnnotations([anno]);
    expect(anno.body).toBe('worth a look');
  });

  test('a line of nothing but tags goes with them', () => {
    const anno = annotation('Some detail\r\n#to-read #ml');
    takeTagsFromAnnotations([anno]);
    expect(anno.body).toBe('Some detail');
  });

  test('a comment of nothing but a tag leaves nothing behind', () => {
    const anno = annotation('', '#ml');
    takeTagsFromAnnotations([anno]);
    expect(anno.topic).toBe('');
  });

  test('a comment nobody tagged is left exactly as it was made', () => {
    const written = 'A note.\r\n\r\n  Indented, and  spaced  out.';
    const anno = annotation(written, 'A topic');
    takeTagsFromAnnotations([anno]);
    expect(anno.body).toBe(written);
    expect(anno.topic).toBe('A topic');
  });

  test('the lines around the tags are kept', () => {
    const anno = annotation('First.\n#ml\nLast.');
    takeTagsFromAnnotations([anno]);
    expect(anno.body).toBe('First.\nLast.');
  });
});
