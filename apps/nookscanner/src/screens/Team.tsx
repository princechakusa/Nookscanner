import { INVITABLE_ROLES } from '@nookscanner/shared';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';

const ROLE: Record<string, { label: string; text: string }> = {
  owner: { label: 'Owner', text: 'Everything, including deleting the company' },
  admin: { label: 'Admin', text: 'Team, buildings and all apartments' },
  manager: { label: 'Manager', text: 'Record, review, publish apartments' },
  editor: { label: 'Editor', text: 'Rooms, appliances and instructions' },
  viewer: { label: 'Viewer', text: 'Read only' },
};

interface Member {
  user_id: string;
  role: string;
}

/**
 * Team: members and roles; invite by email. The invitation is bound to that email (database
 * rule); the invitee signs in with it and enters the code under Account > Join a company.
 */
export function Team({ onBack }: { onBack: () => void }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<(Member & { name: string | null })[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>('manager');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    setMe(auth.user?.id ?? null);
    const { data: mine } = await supabase
      .from('organization_members')
      .select('organization_id')
      .limit(1);
    const org = (mine?.[0] as { organization_id: string } | undefined)?.organization_id ?? null;
    setOrgId(org);
    if (!org) return;
    const { data } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', org)
      .order('role');
    const list = (data ?? []) as Member[];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in(
        'id',
        list.map((m) => m.user_id),
      );
    const names = new Map(
      ((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [
        p.id,
        p.full_name,
      ]),
    );
    setMembers(list.map((m) => ({ ...m, name: names.get(m.user_id) ?? null })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    if (!orgId) return;
    setBusy(true);
    setError('');
    setSent('');
    const { data, error: e } = await supabase
      .rpc('create_invitation', { p_org: orgId, p_email: email.trim().toLowerCase(), p_role: role })
      .single();
    setBusy(false);
    if (e || !data) {
      setError(
        'Could not create the invitation. Only owners and admins can invite (owners for the Owner role).',
      );
      return;
    }
    const code = (data as { token: string }).token;
    setSent(email.trim());
    setEmail('');
    await Share.share({
      message:
        `You're invited to join our team on Nookscanner as ${ROLE[role]?.label ?? role}.\n\n` +
        `1. Install Nookscanner Capture and sign in with ${email.trim()}.\n` +
        `2. Open Account > Join a company and paste this code:\n\n${code}\n\nThe code works once and expires in 7 days.`,
    });
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { flexGrow: 1, paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        hitSlop={10}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>‹ Account</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        Team
      </Text>
      {members.map((m) => (
        <View key={m.user_id} style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.text, { fontWeight: '600' }]}>
              {m.name ?? 'Team member'}
              {m.user_id === me ? ' (you)' : ''}
            </Text>
            <Text style={styles.muted}>{ROLE[m.role]?.text ?? ''}</Text>
          </View>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>
            {ROLE[m.role]?.label ?? m.role}
          </Text>
        </View>
      ))}

      <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 8 }]}>
        Invite someone
      </Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Email of the person to invite"
        placeholder="colleague@company.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {INVITABLE_ROLES.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: role === r }}
            onPress={() => setRole(r)}
            style={{
              paddingHorizontal: 14,
              minHeight: 44,
              justifyContent: 'center',
              borderRadius: 999,
              borderWidth: 1,
              borderColor: role === r ? colors.primary : colors.border,
              backgroundColor: role === r ? colors.primarySoft : colors.surface,
            }}
          >
            <Text style={{ color: role === r ? colors.primary : colors.ink }}>
              {ROLE[r]?.label ?? r}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.muted}>{ROLE[role]?.text}</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {sent ? (
        <Text style={[styles.text, { color: colors.primary }]}>
          Invitation for {sent} created and shared.
        </Text>
      ) : null}
      <Button
        label="Create and share invitation"
        onPress={() => void invite()}
        busy={busy}
        disabled={!/\S+@\S+\.\S+/.test(email)}
      />
    </ScrollView>
  );
}
