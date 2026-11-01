import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  LOCATION_CONFIGURED_DISTRICTS,
  OTHER_AREA_ID,
  SALEM_AREAS,
  getSelectableAreasForTaluk,
} from '../data/salemLocations';
import { localizePlace, localizeTaluk, localizeDistrict } from '../i18n/locationNames';
import { useLocationNames } from '../i18n/useLocationNames';

/**
 * Taluk + area selectors for worker registration and profile editing.
 * Stateless (no hooks beyond useLanguage) and fully controlled by the parent.
 *
 * The area list only ever contains the selected taluk's areas (verified or
 * provisional) from src/data/salemLocations.ts, plus the manual "Other area in this taluk"
 * option. The backend re-validates everything - this is UX only.
 */

export interface LocationFieldsValue {
  district: string;
  taluk: string;
  /** '' (nothing chosen), OTHER_AREA_ID, or a verified area id */
  areaChoice: string;
  /** manual area text, used when areaChoice === OTHER_AREA_ID */
  customArea: string;
}

/** Turn the form value into what the API expects (or an error key). */
export function resolveAreaPayload(v: LocationFieldsValue):
  | { ok: true; taluk: string; areaId: string | null; publicArea: string }
  | { ok: false; error: 'taluk' | 'area' } {
  if (!v.taluk) return { ok: false, error: 'taluk' };
  const cfg = LOCATION_CONFIGURED_DISTRICTS[v.district];
  const listed = getSelectableAreasForTaluk(v.taluk, cfg?.areas ?? SALEM_AREAS);
  const choice = listed.length === 0 ? OTHER_AREA_ID : v.areaChoice;
  if (choice === OTHER_AREA_ID) {
    const text = v.customArea.trim();
    if (text.length < 2) return { ok: false, error: 'area' };
    return { ok: true, taluk: v.taluk, areaId: null, publicArea: text };
  }
  const hit = listed.find((a) => a.id === choice);
  if (!hit) return { ok: false, error: 'area' };
  return { ok: true, taluk: v.taluk, areaId: hit.id, publicArea: hit.nameEn };
}

interface Props {
  value: LocationFieldsValue;
  onChange: (patch: Partial<LocationFieldsValue>) => void;
  inputClass?: string;
  /** Registration: true. Dashboard for a legacy worker without a taluk: false until they start choosing. */
  required?: boolean;
}

const DEFAULT_INPUT = 'w-full min-w-0 text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none';

export const WorkerLocationFields: React.FC<Props> = ({ value, onChange, inputClass = DEFAULT_INPUT, required = true }) => {
  const { t } = useLanguage();
  const loc = useLocationNames();
  const cfg = LOCATION_CONFIGURED_DISTRICTS[value.district];
  const taluks = cfg?.taluks ?? [];
  const listed = value.taluk ? getSelectableAreasForTaluk(value.taluk, cfg?.areas ?? SALEM_AREAS) : [];
  const choice = value.taluk && listed.length === 0 ? OTHER_AREA_ID : value.areaChoice;
  const label = 'block text-xs font-bold text-[#176B4D] mb-1';

  return (
    <div className="space-y-2 min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="min-w-0">
          <label className={label}>{t('profile_taluk')} *</label>
          <select
            required={required}
            value={value.taluk}
            onChange={(e) => onChange({ taluk: e.target.value, areaChoice: '', customArea: '' })}
            className={`${inputClass} truncate`}
          >
            <option value="">{t('select_taluk')}</option>
            {taluks.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {loc.taluk(tk.id)}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label className={label}>{t('profile_area')} *</label>
          <select
            required={required && Boolean(value.taluk)}
            disabled={!value.taluk}
            value={choice}
            onChange={(e) => onChange({ areaChoice: e.target.value })}
            className={`${inputClass} truncate disabled:bg-stone-100`}
          >
            <option value="">{t('select_area')}</option>
            {listed.map((a) => (
              <option key={a.id} value={a.id}>
                {loc.place(a.nameEn)}
              </option>
            ))}
            <option value={OTHER_AREA_ID}>{t('area_other')}</option>
          </select>
        </div>
      </div>

      {value.taluk && choice === OTHER_AREA_ID && (
        <div>
          <label className={label}>{t('area_other_label')} *</label>
          <input
            type="text"
            required={required}
            minLength={2}
            maxLength={60}
            value={value.customArea}
            onChange={(e) => onChange({ customArea: e.target.value })}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
};
