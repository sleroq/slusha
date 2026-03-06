export interface SectionMatcher {
  normalizedSearch: string;
  hasSearch: boolean;
  matchesSection: (...terms: string[]) => boolean;
  matchesBlockItem: (section: string, ...terms: string[]) => boolean;
}

export function createSectionMatcher(searchQuery: string): SectionMatcher {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const hasSearch = normalizedSearch.length > 0;

  const matchesSection = (...terms: string[]): boolean => {
    if (!hasSearch) {
      return true;
    }

    return terms.some((term) => term.toLowerCase().includes(normalizedSearch));
  };

  const matchesBlockItem = (section: string, ...terms: string[]): boolean => {
    if (!hasSearch) {
      return true;
    }

    return matchesSection(section, ...terms);
  };

  return {
    normalizedSearch,
    hasSearch,
    matchesSection,
    matchesBlockItem,
  };
}
