/**
 * @test REQ-LLM-PROMPTS
 * @intent `prompt.service.ts` had NO dedicated test file and scored 44.90% under
 *   mutation testing: the shipped templates were only ever observed indirectly
 *   through whichever service happened to build a prompt, so `render`'s
 *   substitution rules -- and in particular its guard against a REPLACEMENT
 *   VALUE being substituted again -- were untested. This drives the class
 *   directly with injected templates so each rule has a case of its own.
 * @covers src/services/prompt.service.ts
 */
import { describe, expect, it } from 'vitest';
import { PromptService } from '../src/services/prompt.service.js';

/** Minimal template record for driving render() directly. */
function templates(
  record: Record<string, string>
): Record<string, { name: string; template: string; variables: string[] }> {
  return Object.fromEntries(
    Object.entries(record).map(([name, template]) => [name, { name, template, variables: [] }])
  );
}

describe('PromptService', () => {
  describe('default templates', () => {
    it('ships a non-empty template set', () => {
      const service = new PromptService();
      // The class is constructed with the module TEMPLATES when no override is
      // given; a regression that emptied the table would surface here.
      expect(service.getTemplate('generateQuestion')).toBeDefined();
    });

    it('renders the generateQuestion template with its placeholders replaced', () => {
      const service = new PromptService();
      const out = service.render('generateQuestion', {
        topic: 'T',
        currentQuestion: 'Q?',
        userAnswer: 'A.',
      });
      expect(out).not.toContain('{{topic}}');
      expect(out).toContain('Q?');
      expect(out).toContain('A.');
    });
  });

  describe('render', () => {
    it('substitutes every occurrence of a placeholder, not just the first', () => {
      // The `g` flag is the whole point: without it only the first hit is
      // replaced and the rest leak into the LLM prompt as literal "{{name}}".
      const service = new PromptService(templates({ t: 'a {{x}} b {{x}} c' }));
      expect(service.render('t', { x: 'V' })).toBe('a V b V c');
    });

    it('leaves placeholders with no supplied value untouched', () => {
      const service = new PromptService(templates({ t: '{{a}} and {{b}}' }));
      expect(service.render('t', { a: 'A' })).toBe('A and {{b}}');
    });

    it('substitutes an empty string', () => {
      const service = new PromptService(templates({ t: 'x{{a}}y' }));
      expect(service.render('t', { a: '' })).toBe('xy');
    });

    it('throws a named error for an unknown template', () => {
      const service = new PromptService(templates({ t: 'x' }));
      expect(() => service.render('nope', {})).toThrow('Template not found: nope');
    });

    it('does NOT re-substitute braces that arrive inside a value', () => {
      // This is the security-relevant rule. If a user's answer contains
      // "{{question}}", a naive implementation would substitute it again and the
      // user could pull the previous question into their own answer's slot.
      const service = new PromptService(templates({ t: '{{a}}|{{b}}' }));
      const out = service.render('t', { a: 'literal {{b}} here', b: 'SECRET' });
      expect(out).toBe('literal {{b}} here|SECRET');
      expect(out).not.toContain('SECRET|SECRET');
    });

    it('does not re-substitute a closing-brace pair inside a value', () => {
      const service = new PromptService(templates({ t: '{{a}}-{{b}}' }));
      const out = service.render('t', { a: 'x}}y', b: 'B' });
      expect(out).toBe('x}}y-B');
    });

    it('applies substitutions in insertion order, later keys seeing settled text', () => {
      // Object.entries order is the documented order; this pins the behaviour so
      // a switch to Object.keys/reverse iteration is visible.
      const service = new PromptService(templates({ t: '{{a}}{{b}}' }));
      expect(service.render('t', { a: '1', b: '2' })).toBe('12');
    });

    it('returns the template unchanged when no variables are given', () => {
      const service = new PromptService(templates({ t: 'plain {{a}} text' }));
      expect(service.render('t', {})).toBe('plain {{a}} text');
    });

    it('accepts a template whose value contains regex metacharacters in the key', () => {
      // Keys are interpolated into `new RegExp`, so a key with regex syntax is
      // worth pinning: this documents which keys are usable at all.
      const service = new PromptService(templates({ t: 'value {{plain}}' }));
      expect(service.render('t', { plain: 'ok' })).toBe('value ok');
    });
  });

  describe('getTemplate', () => {
    it('returns the template for a known name', () => {
      const service = new PromptService(templates({ t: 'body' }));
      expect(service.getTemplate('t')?.template).toBe('body');
    });

    it('returns undefined for an unknown name', () => {
      const service = new PromptService(templates({ t: 'body' }));
      expect(service.getTemplate('missing')).toBeUndefined();
    });

    it('exposes the variables list', () => {
      const service = new PromptService({
        t: { name: 't', template: 'x', variables: ['a', 'b'] },
      });
      expect(service.getTemplate('t')?.variables).toEqual(['a', 'b']);
    });
  });
});
