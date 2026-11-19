import type { Metadata } from 'next';
import { SectionPlaceholder } from '../section-placeholder.tsx';

export const metadata: Metadata = { title: 'Properties' };

export default function PropertiesPage() {
  return (
    <SectionPlaceholder
      title={'Properties'}
      emptyTitle={'No properties yet'}
      body={'Properties group your apartments by building or site. Available in Phase 4.'}
    />
  );
}
