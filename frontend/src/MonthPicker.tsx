const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

export function validMonth(value: string) {
  return /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value);
}

export default function MonthPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [year, month] = value.split("-");
  return <>
    <label className="budget-field">Month
      <select value={month} onChange={event => onChange(year + "-" + event.target.value)}>
        {monthNames.map((name, index) => <option value={String(index + 1).padStart(2, "0")} key={name}>{name}</option>)}
      </select>
    </label>
    <label className="budget-field">Year
      <input type="text" inputMode="numeric" maxLength={4} pattern="(19[0-9]{2}|[2-9][0-9]{3})"
        title="Enter a four-digit year from 1900 to 9999" required value={year}
        onChange={event => onChange(event.target.value.replace(/[^0-9]/g, "") + "-" + month)} />
    </label>
  </>;
}
