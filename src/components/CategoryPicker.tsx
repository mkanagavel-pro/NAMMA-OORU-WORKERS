import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, ChevronDown } from 'lucide-react';
import { Modal } from './Modal';
import { useLanguage } from '../i18n/LanguageContext';
import { getMoreCategories, filterCategories } from '../data/tamilNaduData';

/**
 * "More Categories" button + searchable popup listing every category that is not a
 * quick-access pill. Reuses the shared Modal (scrolls inside the viewport, X always
 * visible, closes on outside click). Selecting a category closes the popup.
 */
interface Props {
  selectedCategory: string;
  onSelect: (id: string) => void;
}

export const CategoryPicker: React.FC<Props> = ({ selectedCategory, onSelect }) => {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const more = useMemo(() => getMoreCategories(), []);
  const results = useMemo(() => filterCategories(more, query), [more, query]);
  const selectedInMore = more.some((c) => c.id === selectedCategory);

  useEffect(() => {
    if (open) {
      setQuery('');
      // let the popup mount, then focus the search box
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  const label = (c: { nameEn: string; nameTa: string }) => (language === 'ta' ? c.nameTa : c.nameEn);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap border ${
          selectedInMore
            ? 'border-[#176B4D] bg-[#176B4D]/10 text-[#176B4D]'
            : 'border-[#176B4D]/40 bg-white text-[#176B4D] hover:bg-[#176B4D]/5'
        }`}
      >
        <span>{t('more_categories')}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          widthClass="max-w-md"
          bodyClassName="p-0"
          ariaLabel={t('more_categories')}
        >
          <div className="sticky top-0 z-10 bg-[#FAF7EF] px-4 sm:px-5 pt-4 pb-3 border-b border-[#176B4D]/10">
            <h3 className="text-base font-black text-[#26332D] mb-4 pr-12 leading-6">{t('more_categories')}</h3>
            <div className="relative">
              <Search className="w-4 h-4 text-[#176B4D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search_categories_placeholder')}
                aria-label={t('search_categories_placeholder')}
                className="w-full text-sm pl-9 pr-3 py-2.5 rounded-xl bg-white border border-[#176B4D]/25 focus:outline-none focus:ring-2 focus:ring-[#176B4D] text-[#26332D]"
              />
            </div>
          </div>

          <ul className="p-2 sm:p-3" role="listbox" aria-label={t('more_categories')}>
            {results.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-[#586B63]" data-no-categories>
                {t('no_categories_found')}
              </li>
            ) : (
              results.map((c) => {
                const isSelected = c.id === selectedCategory;
                return (
                  <li key={c.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      data-category-id={c.id}
                      onClick={() => {
                        onSelect(c.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 transition ${
                        isSelected
                          ? 'bg-[#176B4D] text-[#FAF7EF]'
                          : 'text-[#26332D] hover:bg-[#176B4D]/10'
                      }`}
                    >
                      <span className="min-w-0 break-words">{label(c)}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0 text-[#E8B83D]" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Modal>
      )}
    </>
  );
};
