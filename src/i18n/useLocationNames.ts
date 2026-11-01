import { useLanguage } from './LanguageContext';
import { localizeDistrict, localizePlace, localizePlaces, localizeTaluk } from './locationNames';

/** React helper: location formatters bound to the current UI language. */
export function useLocationNames() {
  const { language } = useLanguage();
  return {
    language,
    district: (v: string | null | undefined) => localizeDistrict(v, language),
    taluk: (v: string | null | undefined) => localizeTaluk(v, language),
    place: (v: string | null | undefined) => localizePlace(v, language),
    places: (v: string[] | null | undefined) => localizePlaces(v, language),
  };
}
