import { useId, useState } from 'react';
import './SensitiveInput.css';

/**
 * AgentSam SensitiveInput — Kumo interaction grammar (masked / reveal / error).
 *
 * @param {object} props
 * @param {string} [props.value] Controlled value
 * @param {string} [props.defaultValue]
 * @param {(value: string) => void} [props.onChange]
 * @param {'xs'|'sm'|'base'|'lg'} [props.size='base']
 * @param {'default'|'error'} [props.variant='default']
 * @param {import('react').ReactNode} [props.label]
 * @param {import('react').ReactNode} [props.labelTooltip]
 * @param {import('react').ReactNode} [props.description]
 * @param {string|object} [props.error] Error message or { message }
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.readOnly]
 * @param {boolean} [props.required]
 * @param {boolean} [props.checked]
 * @param {string} [props.placeholder]
 * @param {string} [props.name]
 * @param {string} [props.id]
 * @param {string} [props.className]
 * @param {string} [props.autoComplete]
 * @param {string} [props.alt]
 * @param {string} [props.list]
 * @param {string} [props.lang]
 * @param {string} [props.title]
 * @param {number|string} [props.width]
 * @param {number|string} [props.height]
 * @param {import('react').ReactNode} [props.children]
 * @param {boolean} [props.showCopy=true]
 */
export function SensitiveInput({
  value,
  defaultValue = '',
  onChange,
  size = 'base',
  variant = 'default',
  label,
  labelTooltip,
  description,
  error,
  disabled = false,
  readOnly = false,
  required = false,
  checked,
  placeholder = 'Click to reveal',
  name,
  id: idProp,
  className = '',
  autoComplete = 'off',
  alt,
  list,
  lang,
  title,
  width,
  height,
  children,
  showCopy = true,
  ...rest
}) {
  const autoId = useId();
  const inputId = idProp || autoId;
  const [revealed, setRevealed] = useState(Boolean(readOnly));
  const [internal, setInternal] = useState(defaultValue);
  const current = value !== undefined ? value : internal;

  const errorMessage =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object'
        ? String(error.message || error.error || '')
        : '';
  const isError = variant === 'error' || Boolean(errorMessage);

  function set(next) {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  }

  async function copy() {
    if (!current || disabled) return;
    try {
      await navigator.clipboard.writeText(current);
    } catch {
      /* ignore */
    }
  }

  const style = {};
  if (width != null) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height != null) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={[
        'as-sensitive',
        `as-sensitive--${size}`,
        isError ? 'as-sensitive--error' : 'as-sensitive--default',
        disabled ? 'as-sensitive--disabled' : '',
        readOnly ? 'as-sensitive--readonly' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      data-variant={isError ? 'error' : 'default'}
      data-size={size}
    >
      {(label || showCopy) && (
        <div className="as-sensitive__header">
          {label ? (
            <label className="as-sensitive__label" htmlFor={inputId} title={typeof labelTooltip === 'string' ? labelTooltip : undefined}>
              <span>{label}</span>
              {labelTooltip ? (
                <span className="as-sensitive__tooltip" aria-label="More info" title={typeof labelTooltip === 'string' ? labelTooltip : undefined}>
                  ⓘ
                </span>
              ) : null}
              {required ? <span className="as-sensitive__required" aria-hidden="true">*</span> : null}
            </label>
          ) : (
            <span />
          )}
          {showCopy ? (
            <button
              type="button"
              className="as-sensitive__copy"
              onClick={copy}
              disabled={!current || disabled}
            >
              Copy
            </button>
          ) : null}
        </div>
      )}

      <div className="as-sensitive__control">
        <input
          id={inputId}
          name={name}
          type={revealed || readOnly ? 'text' : 'password'}
          autoComplete={autoComplete}
          spellCheck={false}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          checked={checked}
          placeholder={placeholder}
          value={current}
          onChange={(e) => set(e.target.value)}
          alt={alt}
          list={list}
          lang={lang}
          title={title}
          aria-invalid={isError || undefined}
          aria-describedby={
            [description ? `${inputId}-desc` : null, errorMessage ? `${inputId}-err` : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className="as-sensitive__input"
          {...rest}
        />
        {!readOnly ? (
          <button
            type="button"
            className="as-sensitive__reveal"
            aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
            onClick={() => setRevealed((v) => !v)}
            disabled={disabled}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        ) : (
          <span className="as-sensitive__eye" aria-hidden="true">
            ◉
          </span>
        )}
      </div>

      {children}

      {description && !errorMessage ? (
        <p id={`${inputId}-desc`} className="as-sensitive__description">
          {description}
        </p>
      ) : null}

      {errorMessage ? (
        <p id={`${inputId}-err`} className="as-sensitive__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
