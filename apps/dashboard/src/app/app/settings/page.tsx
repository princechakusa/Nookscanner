import type { Metadata } from 'next';
import { SectionPlaceholder } from '../section-placeholder.tsx';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <SectionPlaceholder
      title={'Settings'}
      emptyTitle={'Organization settings'}
      body={'Members, invitations, roles and support contacts. Available in Phase 4.'}
    />
  );
}
