import React from 'react';
import './task-multi-choice.css';

export function TaskMultiChoice({ field, value, onChange }) {
  const selected = value ?? field.default ?? [];
  return <fieldset className="task-multi">
    <legend>{field.label}{field.required ? ' *' : ''}</legend>
    <p className="task-multi-help">Bisa pilih lebih dari satu. Klik untuk memilih atau membatalkan.</p>
    <div className="task-multi-options">{field.options.map(option => <label className={`task-multi-option${selected.includes(option) ? ' is-selected' : ''}`} key={option}>
      <input type="checkbox" name={field.name} value={option} checked={selected.includes(option)} onChange={e => onChange(e.target.checked ? [...selected, option] : selected.filter(item => item !== option))}/>
      <span>{option}</span>
    </label>)}</div>
    <p className="task-multi-summary" role="status" aria-live="polite">{selected.length ? `${selected.length} dipilih: ${selected.join(', ')}` : 'Belum ada pilihan.'}</p>
  </fieldset>;
}
