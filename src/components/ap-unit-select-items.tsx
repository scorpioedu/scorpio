import { AP_COURSE_IDS, apCourseName, apUnitKey, apUnits } from "@/data/ap";
import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";

/**
 * The units of every AP course, grouped under the course name, for a <Select>. Values are
 * `apUnitKey(course, unit)`; read them back with `parseApUnitKey`.
 */
export function ApUnitSelectItems({ itemClassName }: { itemClassName?: string }) {
  return (
    <>
      {AP_COURSE_IDS.map((course) => (
        <SelectGroup key={course}>
          <SelectLabel>{apCourseName(course)}</SelectLabel>
          {apUnits(course).map((u) => (
            <SelectItem key={u.unit} value={apUnitKey(course, u.unit)} className={itemClassName}>
              Unit {u.unit}: {u.title}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
