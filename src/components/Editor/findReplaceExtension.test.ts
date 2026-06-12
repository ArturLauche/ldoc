import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from './editorExtensions';
import { getSearchState } from './findReplaceExtension';

describe('findReplaceExtension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>alpha beta alpha</p><p>Alpha gamma</p>',
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('finds matches across paragraphs, case-insensitive by default', () => {
    editor.commands.setSearchQuery('alpha');

    const search = getSearchState(editor.state);
    expect(search?.matches).toHaveLength(3);
    expect(search?.activeIndex).toBe(0);
  });

  it('selects the first match as soon as the query is set', () => {
    editor.commands.setSearchQuery('alpha');

    const search = getSearchState(editor.state);
    const firstMatch = search?.matches[0];
    expect(firstMatch).toBeDefined();
    expect(editor.state.selection.from).toBe(firstMatch?.from);
    expect(editor.state.selection.to).toBe(firstMatch?.to);
  });

  it('respects case sensitivity', () => {
    editor.commands.setSearchQuery('alpha', true);

    expect(getSearchState(editor.state)?.matches).toHaveLength(2);
  });

  it('cycles the active match forward and backward with wrap-around', () => {
    editor.commands.setSearchQuery('alpha');

    editor.commands.findNextMatch();
    expect(getSearchState(editor.state)?.activeIndex).toBe(1);

    editor.commands.findNextMatch();
    editor.commands.findNextMatch();
    expect(getSearchState(editor.state)?.activeIndex).toBe(0);

    editor.commands.findPreviousMatch();
    expect(getSearchState(editor.state)?.activeIndex).toBe(2);
  });

  it('replaces only the active match', () => {
    editor.commands.setSearchQuery('alpha');
    editor.commands.replaceCurrentMatch('omega');

    expect(editor.getText()).toContain('omega beta alpha');
    expect(getSearchState(editor.state)?.matches).toHaveLength(2);
  });

  it('replaces all matches at once', () => {
    editor.commands.setSearchQuery('alpha');
    editor.commands.replaceAllMatches('omega');

    const search = getSearchState(editor.state);
    expect(search?.matches).toHaveLength(0);
    expect(editor.getText({ blockSeparator: '\n' })).toBe('omega beta omega\nomega gamma');
  });

  it('recomputes matches when the document changes', () => {
    editor.commands.setSearchQuery('alpha');
    editor.commands.insertContentAt(editor.state.doc.content.size, '<p>alpha again</p>');

    expect(getSearchState(editor.state)?.matches).toHaveLength(4);
  });

  it('clears matches when the search is dismissed', () => {
    editor.commands.setSearchQuery('alpha');
    editor.commands.clearSearch();

    const search = getSearchState(editor.state);
    expect(search?.matches).toHaveLength(0);
    expect(search?.query).toBe('');
  });

  it('reports no matches without erroring for absent queries', () => {
    editor.commands.setSearchQuery('zzz-not-present');

    expect(getSearchState(editor.state)?.matches).toHaveLength(0);
    expect(editor.commands.findNextMatch()).toBe(false);
    expect(editor.commands.replaceAllMatches('x')).toBe(false);
  });
});
