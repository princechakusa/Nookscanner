import { instructionSchema } from '@nookscanner/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';
import type { ApplianceRow } from './Appliances.tsx';

type Locale = 'en' | 'ar';
interface Version {
  id: string;
  locale: Locale;
  version: number;
  title: string;
  steps: { text: string }[];
  troubleshooting: { problem: string; solution: string }[];
  verification_status: string;
}
const PAIRS = 5;
const FIELD_TEXT: Record<string, string> = {
  NAME_REQUIRED: 'Enter a title.',
  STEPS_REQUIRED: 'Write at least one step.',
  STEP_TOO_LONG: 'A step is too long (1000 characters at most).',
  TOO_MANY_STEPS: 'Use at most 30 steps.',
  PROBLEM_REQUIRED: 'Each solution needs its problem.',
  SOLUTION_REQUIRED: 'Each problem needs a solution.',
};

/**
 * Instructions of one appliance in English and Arabic. Every save is a new, unverified version
 * (append-only, Stage 8.3); managers verify the latest version (8.4). Same rules as the dashboard.
 */
export function Instructions({ appliance }: { appliance: ApplianceRow }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [versions, setVersions] = useState<Version[]>([]);
  const [instructionId, setInstructionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState('');
  const [trouble, setTrouble] = useState<{ problem: string; solution: string }[]>(
    Array.from({ length: PAIRS }, () => ({ problem: '', solution: '' })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const latest = (l: Locale) =>
    versions.filter((v) => v.locale === l).sort((a, b) => b.version - a.version)[0];

  const load = useCallback(async () => {
    const { data: ins } = await supabase
      .from('instructions')
      .select('id')
      .eq('appliance_id', appliance.id)
      .maybeSingle();
    const id = (ins as { id: string } | null)?.id ?? null;
    setInstructionId(id);
    if (!id) return setVersions([]);
    const { data } = await supabase
      .from('instruction_versions')
      .select('id, locale, version, title, steps, troubleshooting, verification_status')
      .eq('instruction_id', id)
      .order('version', { ascending: false });
    setVersions((data ?? []) as Version[]);
  }, [appliance.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fill the editor with the latest version of the chosen language.
  useEffect(() => {
    const v = latest(locale);
    setTitle(v?.title ?? '');
    setSteps(v ? v.steps.map((s) => s.text).join('\n') : '');
    setTrouble(
      Array.from(
        { length: PAIRS },
        (_, i) => v?.troubleshooting[i] ?? { problem: '', solution: '' },
      ),
    );
    setError('');
    setNotice('');
  }, [locale, versions]);

  async function save() {
    const parsed = instructionSchema.safeParse({
      locale,
      title,
      steps,
      troubleshooting: trouble,
      bodyMd: '',
    });
    if (!parsed.success)
      return setError(FIELD_TEXT[parsed.error.issues[0]!.message] ?? 'Check the fields.');
    setBusy(true);
    setError('');
    let id = instructionId;
    if (!id) {
      const { data, error: e } = await supabase
        .from('instructions')
        .insert({ appliance_id: appliance.id })
        .select('id')
        .single();
      if (e || !data) {
        setBusy(false);
        return setError('Could not save (editors and managers only).');
      }
      id = (data as { id: string }).id;
    }
    const d = parsed.data;
    const { error: e } = await supabase.from('instruction_versions').insert({
      instruction_id: id,
      locale: d.locale,
      version: 1, // the database assigns the next number
      title: d.title,
      steps: d.steps.map((text) => ({ text })),
      troubleshooting: d.troubleshooting,
    });
    setBusy(false);
    if (e) return setError('Could not save (editors and managers only).');
    setNotice('Saved as a new version. A manager verifies it before guests see it.');
    void load();
  }

  async function verify() {
    const v = latest(locale);
    if (!v) return;
    setBusy(true);
    const { error: e } = await supabase.rpc('verify_instruction_version', { p_version: v.id });
    setBusy(false);
    if (e) return setError('Only managers can verify instructions.');
    setNotice('Verified.');
    void load();
  }

  const current = latest(locale);
  const rtl = locale === 'ar' ? ({ textAlign: 'right', writingDirection: 'rtl' } as const) : null;
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.scrollContent,
        styles.pushed,
        { flexGrow: 1, paddingBottom: 40 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
        {(['en', 'ar'] as const).map((l) => (
          <Pressable
            key={l}
            accessibilityRole="tab"
            accessibilityState={{ selected: locale === l }}
            onPress={() => setLocale(l)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: locale === l ? colors.primary : colors.border,
              backgroundColor: locale === l ? colors.primarySoft : colors.surface,
            }}
          >
            <Text style={{ color: locale === l ? colors.primary : colors.ink, fontWeight: '600' }}>
              {l === 'en' ? 'English' : 'العربية'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.muted}>
        {current
          ? `Version ${current.version} · ${current.verification_status === 'verified' ? 'verified' : 'not verified yet'}`
          : 'No instructions in this language yet.'}
      </Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={[styles.input, rtl]}
        accessibilityLabel="Title"
        placeholder={locale === 'ar' ? 'تشغيل التبريد' : 'Turn on cooling'}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />
      <Text style={styles.label}>Steps, one per line</Text>
      <TextInput
        style={[styles.input, { minHeight: 140, textAlignVertical: 'top', paddingTop: 10 }, rtl]}
        accessibilityLabel="Steps, one per line"
        multiline
        placeholder={locale === 'ar' ? 'اضغط زر التشغيل' : 'Press **Power** on the remote'}
        value={steps}
        onChangeText={setSteps}
      />
      <Text style={styles.muted}>**bold** and *italic* work; links must start with https://.</Text>
      <Text style={styles.label}>Troubleshooting (optional)</Text>
      {trouble.map((t, i) => (
        <View key={i} style={{ gap: 6 }}>
          <TextInput
            style={[styles.input, rtl]}
            accessibilityLabel={`Problem ${i + 1}`}
            placeholder={`Problem ${i + 1}`}
            value={t.problem}
            onChangeText={(v) =>
              setTrouble(trouble.map((x, j) => (j === i ? { ...x, problem: v } : x)))
            }
          />
          <TextInput
            style={[styles.input, rtl]}
            accessibilityLabel={`Solution ${i + 1}`}
            placeholder={`Solution ${i + 1}`}
            value={t.solution}
            onChangeText={(v) =>
              setTrouble(trouble.map((x, j) => (j === i ? { ...x, solution: v } : x)))
            }
          />
        </View>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? <Text style={[styles.text, { color: colors.primary }]}>{notice}</Text> : null}
      <Button
        label="Save as new version"
        onPress={() => void save()}
        busy={busy}
        disabled={!title.trim() || !steps.trim()}
      />
      {current && current.verification_status !== 'verified' ? (
        <Button
          label={`Verify version ${current.version}`}
          variant="secondary"
          onPress={() => void verify()}
          busy={busy}
        />
      ) : null}
    </ScrollView>
  );
}
