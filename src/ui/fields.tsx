// Small controlled inputs that tolerate in-progress typing.
import { useEffect, useState } from 'preact/hooks';

const parse = (t: string) => (t.trim() === '' ? NaN : Number(t));
const show = (n: number) => (Number.isNaN(n) ? '' : String(n));

/** With `onClear`, an empty box is allowed and means "not set" (pass NaN as the value for that). */
export function NumField(props: {
  value: number;
  onChange: (n: number) => void;
  onClear?: () => void;
  label: string;
  unit?: string;
  class?: string;
}) {
  const [text, setText] = useState(show(props.value));
  useEffect(() => {
    if (!Object.is(parse(text), props.value)) setText(show(props.value));
    // only react to outside changes of value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  const blank = text.trim() === '';
  const invalid = !(blank && props.onClear) && !Number.isFinite(parse(text));
  const input = (
    <input
      type="text"
      inputMode="decimal"
      class={`num ${props.class ?? ''} ${invalid ? 'invalid' : ''}`}
      aria-label={props.label}
      aria-invalid={invalid}
      value={text}
      onInput={(e) => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        if (t.trim() === '' && props.onClear) props.onClear();
        else props.onChange(parse(t));
      }}
    />
  );
  if (!props.unit) return input;
  return (
    <span class="num-wrap" style={{ '--unit-chars': props.unit.length }}>
      {input}
      <span class="unit-tag" aria-hidden="true">
        {props.unit}
      </span>
    </span>
  );
}

/** Text that commits on blur or Enter (ids, so renames don't cascade on every keystroke). */
export function CommitField(props: { value: string; onCommit: (s: string) => void; label: string; class?: string; title?: string }) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  const commit = () => {
    const t = text.trim();
    // the owner may refuse (invalid or taken id); show the current value until it changes
    setText(props.value);
    if (t && t !== props.value) props.onCommit(t);
  };
  return (
    <input
      type="text"
      class={props.class}
      aria-label={props.label}
      title={props.title}
      value={text}
      onInput={(e) => setText((e.target as HTMLInputElement).value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(props.value);
      }}
    />
  );
}

export function Select<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  class?: string;
  /** Shown (and selected) when the value isn't one of the options. */
  placeholder?: string;
}) {
  const missing = !props.options.some((o) => o.value === props.value);
  const options = missing ? [{ value: props.value, label: props.placeholder ?? (props.value || 'Choose…') }, ...props.options] : props.options;
  return (
    <select class={props.class} aria-label={props.label} value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as T)}>
      {options.map((o) => (
        <option value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
