type TextFieldProps = {
  label: string
  type?: 'text' | 'email' | 'password'
  value: string
  onChange: (next: string) => void
  placeholder?: string
  autoComplete?: string
  name?: string
  error?: string
}

export default function TextField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  name,
  error,
}: TextFieldProps) {
  return (
    <label className="tf">
      <div className="tfLabel">{label}</div>
      <input
        className={`tfInput ${error ? 'tfInputError' : ''}`}
        type={type}
        value={value}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <div className="tfError">{error}</div> : null}
    </label>
  )
}

