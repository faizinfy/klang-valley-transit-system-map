import { useId, useMemo, useRef, useState } from 'react';
import { network, searchStations, type Station } from '../lib/network';
import { CodePill } from './Badges';

interface Props {
  label: string;
  value: Station | null;
  onChange: (station: Station | null) => void;
  placeholder?: string;
}

export function StationPicker({ label, value, onChange, placeholder }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchStations(network, query), [query]);

  const choose = (st: Station) => {
    onChange(st);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && query.trim() !== '';

  return (
    <div className="picker">
      <label htmlFor={id} className="picker__label">{label}</label>
      {value && !open ? (
        <button
          type="button"
          className="picker__selected"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus());
          }}
          aria-label={`${label}: ${value.name}. Change`}
        >
          <span className="picker__name">{value.name}</span>
          <span className="pills">{value.stops.map((s) => <CodePill key={s.code} stop={s} />)}</span>
        </button>
      ) : (
        <input
          ref={inputRef}
          id={id}
          className="picker__input"
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-activedescendant={showList && results[active] ? `${id}-${results[active].id}` : undefined}
          placeholder={placeholder ?? 'Station name or code, e.g. KLCC or KJ10'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      )}
      {showList && (
        <ul className="picker__list" id={`${id}-list`} role="listbox">
          {results.length === 0 && <li className="picker__empty">No matching station</li>}
          {results.map((st, i) => (
            <li
              key={st.id}
              id={`${id}-${st.id}`}
              role="option"
              aria-selected={i === active}
              className={`picker__option${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(st);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="picker__name">{st.name}</span>
              <span className="pills">{st.stops.map((s) => <CodePill key={s.code} stop={s} />)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
