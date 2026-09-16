import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AlertCircle, Bell, BookOpen, Check, ChevronRight, CircleHelp,
  Copy, Filter, Inbox, LayoutDashboard, MoreHorizontal, Pencil,
  KeyRound, MessageCircle, Plus, Search, Settings2, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Sparkles, SquareArrowOutUpRight, Trash2,
  Webhook, X, Zap,
} from 'lucide-react';
import { adminUrl, authFetch } from "../lib/api";

// Self-contained page contract. Replace the demo service below with the
// administrator panel's API client when connecting this page to production.
type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
type RuleMode = 'exact' | 'phrase' | 'contains' | 'regex';
type MatchLogic = 'any' | 'all' | 'advanced';
type NotificationChannel = 'in-app' | 'email' | 'webhook' | 'telegram';

type KeywordAlert = {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  enabled: boolean;
  keywords: string[];
  mode: RuleMode;
  logic: MatchLogic;
  caseSensitive: boolean;
  mailbox: string;
  folder: string;
  senderPattern: string;
  recipientPattern: string;
  subjectPattern: string;
  bodyPattern: string;
  attachmentPattern: string;
  channels: NotificationChannel[];
  sysadminEmail: string;
  telegramBot: string;
  cooldown: number;
  matchCount: number;
  lastMatch: string | null;
  createdAt: string;
};

type AlertEvent = {
  id: string;
  alertId: string;
  alertName: string;
  subject: string;
  sender: string;
  mailbox: string;
  matched: string;
  timestamp: string;
  channel: string;
};

type TelegramConnection = {
  connected: boolean;
  chatId: string;
  botName: string;
  configuredAt: string | null;
};

type TelegramSetupInput = {
  botToken: string;
  chatId: string;
};

type KeywordAlertService = {
  listAlerts(): Promise<KeywordAlert[]>;
  listEvents(): Promise<AlertEvent[]>;
  getTelegramConnection(): Promise<TelegramConnection>;
  saveTelegramConnection(input: TelegramSetupInput): Promise<TelegramConnection>;
  saveAlert(alert: KeywordAlert): Promise<KeywordAlert>;
  deleteAlert(id: string): Promise<void>;
  runDryTest(alert: KeywordAlert, sample: { sender: string; recipient: string; subject: string; body: string; attachment: string }): Promise<{ matched: boolean; explanation: string; field: string }>;
};

const demoAlerts: KeywordAlert[] = [
  {
    id: 'fin-wire',
    name: 'Wire transfer & payment holds',
    description: 'Catches urgent treasury requests and payment release language.',
    severity: 'critical',
    enabled: true,
    keywords: ['wire transfer', 'payment hold', 'beneficiary'],
    mode: 'phrase',
    logic: 'any',
    caseSensitive: false,
    mailbox: 'finance@northstar.local',
    folder: 'Inbox',
    senderPattern: '',
    recipientPattern: '',
    subjectPattern: 'payment|wire',
    bodyPattern: '',
    attachmentPattern: '',
    channels: ['in-app', 'email'],
    sysadminEmail: 'ops@northstar.local',
    telegramBot: '',
    cooldown: 30,
    matchCount: 17,
    lastMatch: '8 min ago',
    createdAt: '2024-04-10',
  },
  {
    id: 'security-access',
    name: 'Security access signals',
    description: 'Escalates suspicious login, MFA, and credential language.',
    severity: 'high',
    enabled: true,
    keywords: ['MFA disabled', 'new sign-in', 'credential'],
    mode: 'phrase',
    logic: 'any',
    caseSensitive: false,
    mailbox: 'security@northstar.local',
    folder: 'Inbox',
    senderPattern: '@identity.northstar.local',
    recipientPattern: '',
    subjectPattern: '',
    bodyPattern: '',
    attachmentPattern: '',
    channels: ['in-app', 'webhook'],
    sysadminEmail: '',
    telegramBot: 'infra-watch',
    cooldown: 10,
    matchCount: 9,
    lastMatch: '26 min ago',
    createdAt: '2024-05-02',
  },
  {
    id: 'legal-hold',
    name: 'Legal hold notices',
    description: 'Keeps legal preservation requests visible to the operations team.',
    severity: 'high',
    enabled: true,
    keywords: ['legal hold', 'preservation notice', 'litigation'],
    mode: 'phrase',
    logic: 'all',
    caseSensitive: false,
    mailbox: 'legal@northstar.local',
    folder: 'All Mail',
    senderPattern: '',
    recipientPattern: '',
    subjectPattern: '',
    bodyPattern: '',
    attachmentPattern: 'notice|hold',
    channels: ['in-app', 'email'],
    sysadminEmail: 'sysadmin@northstar.local',
    telegramBot: '',
    cooldown: 60,
    matchCount: 4,
    lastMatch: '2 hr ago',
    createdAt: '2024-03-21',
  },
  {
    id: 'customer-escalation',
    name: 'Customer escalation',
    description: 'Flags high-risk customer language before it becomes a queue fire.',
    severity: 'medium',
    enabled: false,
    keywords: ['executive escalation', 'account review', 'breach'],
    mode: 'contains',
    logic: 'any',
    caseSensitive: false,
    mailbox: 'support@northstar.local',
    folder: 'Priority',
    senderPattern: '',
    recipientPattern: '',
    subjectPattern: '',
    bodyPattern: '',
    attachmentPattern: '',
    channels: ['in-app'],
    sysadminEmail: '',
    telegramBot: '',
    cooldown: 120,
    matchCount: 31,
    lastMatch: 'Yesterday',
    createdAt: '2024-02-11',
  },
];

const demoEvents: AlertEvent[] = [
  { id: 'evt-1', alertId: 'fin-wire', alertName: 'Wire transfer & payment holds', subject: 'RE: Wire transfer approval — EMEA', sender: 'treasury@northstar.local', mailbox: 'finance@northstar.local', matched: 'wire transfer', timestamp: '8 min ago', channel: 'Email + in-app' },
  { id: 'evt-2', alertId: 'security-access', alertName: 'Security access signals', subject: 'MFA disabled for service account', sender: 'identity@northstar.local', mailbox: 'security@northstar.local', matched: 'MFA disabled', timestamp: '26 min ago', channel: 'Webhook' },
  { id: 'evt-3', alertId: 'legal-hold', alertName: 'Legal hold notices', subject: 'Preservation notice: Orion account', sender: 'counsel@northstar.local', mailbox: 'legal@northstar.local', matched: 'preservation notice', timestamp: '2 hr ago', channel: 'Email + in-app' },
  { id: 'evt-4', alertId: 'fin-wire', alertName: 'Wire transfer & payment holds', subject: 'Payment hold — vendor 8821', sender: 'ap@northstar.local', mailbox: 'finance@northstar.local', matched: 'payment hold', timestamp: '3 hr ago', channel: 'Email + in-app' },
];

const keywordAlertService: KeywordAlertService = {
  async listAlerts() {
    const response = await authFetch(adminUrl("/keyword-alerts"));
    if (!response.ok) throw new Error("Failed to load alerts");
    return response.json() as Promise<KeywordAlert[]>;
  },
  async listEvents() {
    const response = await authFetch(adminUrl("/keyword-alert-events"));
    if (!response.ok) throw new Error("Failed to load events");
    return response.json() as Promise<AlertEvent[]>;
  },
  async getTelegramConnection() {
    const response = await authFetch(adminUrl("/telegram-connection"));
    if (!response.ok) throw new Error("Failed to load Telegram connection");
    return response.json() as Promise<TelegramConnection>;
  },
  async saveTelegramConnection(input) {
    const response = await authFetch(adminUrl("/telegram-connection"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json() as TelegramConnection & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Failed to save Telegram connection");
    return data;
  },
  async saveAlert(alert) {
    const method = alert.matchCount ? "PATCH" : "POST";
    const url = method === "PATCH" ? adminUrl(`/keyword-alerts/${alert.id}`) : adminUrl("/keyword-alerts");
    const response = await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    });
    const data = await response.json() as KeywordAlert & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Failed to save alert");
    return data;
  },
  async deleteAlert(id) {
    const response = await authFetch(adminUrl(`/keyword-alerts/${id}`), { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? "Failed to delete alert");
    }
  },
  async runDryTest(alert, sample) {
    const response = await authFetch(adminUrl(`/keyword-alerts/${alert.id}/test`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sample),
    });
    const data = await response.json() as { matched: boolean; explanation: string; field: string } & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Dry run failed");
    return data;
  },
};

type AlertFormState = Omit<KeywordAlert, 'id' | 'matchCount' | 'lastMatch' | 'createdAt'>;
type Toast = { id: number; message: string; tone: 'good' | 'neutral' };

const severityMeta: Record<AlertSeverity, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'bg-[#f7d2c7] text-[#943a2f]', dot: 'bg-[#c75543]' },
  high: { label: 'High', color: 'bg-[#f3dfbd] text-[#855b1c]', dot: 'bg-[#c08a2a]' },
  medium: { label: 'Medium', color: 'bg-[#d5e6e5] text-[#256568]', dot: 'bg-[#37898b]' },
  low: { label: 'Low', color: 'bg-[#e5e3da] text-[#59605d]', dot: 'bg-[#88908b]' },
};

const defaultDraft = (): AlertFormState => ({
  name: '',
  description: '',
  severity: 'medium',
  enabled: true,
  keywords: [],
  mode: 'phrase',
  logic: 'any',
  caseSensitive: false,
  mailbox: 'All controlled mailboxes',
  folder: 'Inbox',
  senderPattern: '',
  recipientPattern: '',
  subjectPattern: '',
  bodyPattern: '',
  attachmentPattern: '',
  channels: ['in-app'],
  sysadminEmail: '',
  telegramBot: '',
  cooldown: 30,
});

const businessPhraseGroups = [
  {
    label: 'Urgent & priority',
    phrases: ['urgent', 'high priority', 'immediate attention', 'action required', 'time sensitive', 'as soon as possible', 'critical issue', 'escalation', 'executive attention', 'deadline'],
  },
  {
    label: 'Finance & payments',
    phrases: ['invoice', 'invoice overdue', 'payment due', 'payment failed', 'past due', 'wire transfer', 'bank transfer', 'purchase order', 'accounts payable', 'accounts receivable', 'refund request', 'expense approval', 'billing issue', 'credit memo'],
  },
  {
    label: 'Sales & revenue',
    phrases: ['new lead', 'sales inquiry', 'interested in pricing', 'request a quote', 'pricing request', 'schedule a demo', 'product demo', 'proposal', 'statement of work', 'ready to purchase', 'renewal opportunity', 'upsell opportunity', 'contract negotiation', 'customer referral'],
  },
  {
    label: 'Customer support',
    phrases: ['customer complaint', 'service issue', 'not satisfied', 'unhappy customer', 'request a refund', 'cancel my account', 'speak to a manager', 'technical support', 'cannot log in', 'service outage', 'poor experience', 'feature request', 'escalated ticket', 'response needed'],
  },
  {
    label: 'Legal & compliance',
    phrases: ['legal notice', 'legal hold', 'subpoena', 'litigation', 'regulatory inquiry', 'compliance issue', 'audit request', 'audit finding', 'contract review', 'terms and conditions', 'privacy request', 'data subject request', 'cease and desist', 'confidentiality agreement'],
  },
  {
    label: 'Security & access',
    phrases: ['security alert', 'suspicious activity', 'suspicious login', 'unauthorized access', 'failed login', 'new login', 'password reset', 'password changed', 'two-factor authentication', 'MFA', 'verification code', 'account locked', 'phishing', 'malware', 'data breach'],
  },
  {
    label: 'HR & people',
    phrases: ['job application', 'candidate inquiry', 'interview request', 'interview feedback', 'offer letter', 'employee concern', 'employee complaint', 'payroll issue', 'benefits question', 'leave request', 'resignation', 'termination', 'new hire', 'performance review'],
  },
  {
    label: 'Operations & vendors',
    phrases: ['vendor issue', 'vendor onboarding', 'supplier inquiry', 'service interruption', 'maintenance window', 'incident report', 'incident response', 'change request', 'purchase request', 'approval needed', 'inventory alert', 'order delayed', 'shipment delayed', 'delivery confirmation'],
  },
  {
    label: 'Projects & approvals',
    phrases: ['project update', 'status update', 'milestone reached', 'project delayed', 'blocked on', 'decision needed', 'approval needed', 'review requested', 'sign off', 'action items', 'meeting follow up', 'next steps', 'change approval', 'budget approval'],
  },
  {
    label: 'Documents & attachments',
    phrases: ['attached document', 'attachment', 'signed agreement', 'signature required', 'for your review', 'final version', 'draft document', 'revised document', 'statement attached', 'receipt attached', 'report attached', 'spreadsheet attached', 'PDF attached', 'confidential document'],
  },
  {
    label: 'Accounts & subscriptions',
    phrases: ['account update', 'email address changed', 'account created', 'account deactivated', 'subscription renewal', 'subscription canceled', 'trial ending', 'payment method expired', 'plan upgrade', 'plan downgrade', 'billing address', 'invoice available', 'verification required', 'account notification'],
  },
  {
    label: 'Meetings & communication',
    phrases: ['meeting request', 'calendar invite', 'reschedule meeting', 'meeting canceled', 'conference call', 'join the meeting', 'follow up', 'reminder', 'please respond', 'quick question', 'introduction', 'out of office', 'availability', 'internal announcement'],
  },
] as const;

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'orange' | 'green' }) {
  const styles = tone === 'orange' ? 'bg-[#f8e0d5] text-[#934735]' : tone === 'green' ? 'bg-[#dcebe0] text-[#2d6b4c]' : 'bg-[#e8e5db] text-[#59605d]';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[.01em] ${styles}`}>{children}</span>;
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const meta = severityMeta[severity];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${meta.color}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfcabb] bg-[#f9f8f3] p-8 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7e3d7] text-[#b24c3c]"><Bell size={24} /></div>
    <h3 className="font-semibold text-[#252c38]">No signals in this view</h3>
    <p className="mt-1 max-w-sm text-sm text-[#737a77]">Try widening your filters, or create a rule that watches for a new operational signal.</p>
    <button data-testid="button-empty-create" onClick={onCreate} className="mt-5 rounded-lg bg-[#bd553f] px-4 py-2 text-sm font-bold text-[#fffaf2] transition hover:bg-[#a94535]">Create alert</button>
  </div>;
}

function AlertRow({ alert, onEdit, onDuplicate, onDelete, onToggle, onDryRun }: {
  alert: KeywordAlert; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onToggle: () => void; onDryRun: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <div data-testid={`row-alert-${alert.id}`} className="group grid grid-cols-[minmax(260px,1.5fr)_120px_minmax(180px,1fr)_150px_110px_42px] items-center gap-4 border-b border-[#e4e0d5] px-5 py-4 transition hover:bg-[#fbfaf5]">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${alert.enabled ? 'bg-[#3b9a76]' : 'bg-[#9aa19c]'}`} />
        <p data-testid={`text-alert-name-${alert.id}`} className="truncate text-sm font-extrabold text-[#252c38]">{alert.name}</p>
        {!alert.enabled && <span className="text-[10px] font-bold uppercase tracking-wider text-[#88908b]">Paused</span>}
      </div>
      <p className="mt-1 truncate pl-4 text-xs text-[#7b827e]">{alert.description}</p>
    </div>
    <div><SeverityBadge severity={alert.severity} /></div>
    <div className="flex flex-wrap gap-1.5">
      {alert.keywords.slice(0, 3).map((word) => <span data-testid={`chip-keyword-${alert.id}-${word}`} key={word} className="rounded-md bg-[#f0eee7] px-2 py-1 text-[11px] font-semibold text-[#59605d]">{word}</span>)}
      {alert.keywords.length > 3 && <span className="px-1 py-1 text-[11px] text-[#8c928e]">+{alert.keywords.length - 3}</span>}
    </div>
    <div className="min-w-0 text-xs"><p className="truncate font-semibold text-[#3c4646]">{alert.mailbox}</p><p className="mt-1 truncate text-[#858b87]">{alert.folder} · {alert.channels.length} destination{alert.channels.length === 1 ? '' : 's'}</p></div>
    <div className="text-xs"><p className="font-bold text-[#3c4646]">{alert.matchCount} matches</p><p className="mt-1 text-[#858b87]">{alert.lastMatch ?? 'Never'}</p></div>
    <div className="relative flex justify-end">
      <button data-testid={`button-alert-menu-${alert.id}`} aria-label={`Actions for ${alert.name}`} onClick={() => setOpen(!open)} className="rounded-lg p-2 text-[#7b827e] transition hover:bg-[#ebe8de] hover:text-[#252c38]"><MoreHorizontal size={18} /></button>
      {open && <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-[#dbd6c9] bg-[#fffdf8] p-1.5 shadow-[0_14px_35px_rgba(36,44,56,.13)]">
        <button data-testid={`button-edit-alert-${alert.id}`} onClick={onEdit} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[#f0eee7]"><Pencil size={14} />Edit rule</button>
        <button data-testid={`button-dry-run-${alert.id}`} onClick={onDryRun} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[#f0eee7]"><Zap size={14} />Run dry test</button>
        <button data-testid={`button-duplicate-alert-${alert.id}`} onClick={onDuplicate} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[#f0eee7]"><Copy size={14} />Duplicate</button>
        <button data-testid={`button-toggle-alert-${alert.id}`} onClick={onToggle} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[#f0eee7]"><SlidersHorizontal size={14} />{alert.enabled ? 'Disable' : 'Enable'}</button>
        <button data-testid={`button-delete-alert-${alert.id}`} onClick={onDelete} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#a44135] hover:bg-[#f8e0d5]"><Trash2 size={14} />Delete</button>
      </div>}
    </div>
  </div>;
}

function AlertCard({ alert, onEdit, onDuplicate, onDelete, onToggle, onDryRun }: Omit<ComponentProps<typeof AlertRow>, 'alert'> & { alert: KeywordAlert }) {
  return <div data-testid={`card-alert-${alert.id}`} className="rounded-2xl border border-[#dfdbcf] bg-[#fffdf8] p-4 shadow-[0_3px_12px_rgba(48,54,55,.04)]">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${alert.enabled ? 'bg-[#3b9a76]' : 'bg-[#9aa19c]'}`} /><div className="min-w-0"><p className="truncate text-sm font-extrabold text-[#252c38]">{alert.name}</p><p className="mt-1 text-xs text-[#7b827e]">{alert.mailbox} · {alert.folder}</p></div></div><SeverityBadge severity={alert.severity} /></div>
    <div className="mt-4 flex flex-wrap gap-1.5">{alert.keywords.map((word) => <span key={word} className="rounded-md bg-[#f0eee7] px-2 py-1 text-[11px] font-semibold text-[#59605d]">{word}</span>)}</div>
    <div className="mt-4 flex items-center justify-between border-t border-[#eeeae1] pt-3 text-xs"><span className="font-semibold text-[#4a5552]">{alert.matchCount} matches</span><span className="text-[#858b87]">{alert.lastMatch ?? 'Never'}</span></div>
    <div className="mt-3 flex gap-2"><button data-testid={`button-card-edit-${alert.id}`} onClick={onEdit} className="flex-1 rounded-lg border border-[#d9d3c6] px-3 py-2 text-xs font-bold text-[#3c4646] hover:bg-[#f0eee7]">Edit</button><button data-testid={`button-card-test-${alert.id}`} onClick={onDryRun} className="rounded-lg bg-[#f5e5dd] px-3 py-2 text-xs font-bold text-[#934735] hover:bg-[#efd2c6]">Dry test</button><button data-testid={`button-card-more-${alert.id}`} onClick={onDuplicate} aria-label="Duplicate alert" className="rounded-lg border border-[#d9d3c6] px-3 py-2 text-[#59605d] hover:bg-[#f0eee7]"><Copy size={14} /></button></div>
  </div>;
}

function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-end justify-center bg-[#1b2730]/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-[#d9d3c6] bg-[#fffdf8] shadow-[0_24px_70px_rgba(29,39,47,.22)] sm:rounded-2xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#ebe7dc] bg-[#fffdf8]/95 px-5 py-4 backdrop-blur sm:px-7"><div>{eyebrow && <p className="mono text-[10px] font-medium uppercase tracking-[.16em] text-[#b24c3c]">{eyebrow}</p>}<h2 className="mt-1 text-lg font-extrabold text-[#252c38]">{title}</h2></div><button data-testid="button-modal-close" aria-label="Close dialog" onClick={onClose} className="rounded-lg p-2 text-[#7b827e] hover:bg-[#f0eee7]"><X size={18} /></button></div>
      <div className="p-5 sm:p-7">{children}</div>
    </div>
  </div>;
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="text-xs font-extrabold text-[#394342]">{label}</span>{hint && <span className="ml-2 text-[10px] text-[#8b918d]">{hint}</span>}<div className="mt-1.5">{children}</div></label>;
}

const inputClass = 'w-full rounded-lg border border-[#d8d2c4] bg-[#fbfaf5] px-3 py-2.5 text-sm text-[#252c38] outline-none transition placeholder:text-[#9da29c] focus:border-[#bd553f] focus:ring-2 focus:ring-[#bd553f]/15';

function TelegramSetupModal({ connection, onClose, onSave }: {
  connection: TelegramConnection;
  onClose: () => void;
  onSave: (input: TelegramSetupInput) => Promise<void>;
}) {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState(connection.chatId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const trimmedToken = botToken.trim();
    const trimmedChatId = chatId.trim();
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(trimmedToken)) {
      setError('Enter a valid Telegram bot token, for example 123456:AA…');
      return;
    }
    if (!/^-?\d{5,}$/.test(trimmedChatId)) {
      setError('Enter a numeric Telegram chat ID, including the minus sign for groups.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ botToken: trimmedToken, chatId: trimmedChatId });
      onClose();
    } catch {
      setError('Telegram could not be connected. No changes were saved.');
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="Connect Telegram once" eyebrow="Workspace notification destination" onClose={onClose}>
    <div className="mb-5 rounded-xl border border-[#cfdedc] bg-[#edf5f2] p-3 text-xs text-[#35645f]">
      <div className="flex items-center gap-2 font-extrabold"><ShieldCheck size={15} />One setup for every alert</div>
      <p className="mt-1 pl-5">After this connection is saved, new and existing alerts can reuse it without asking for the token again.</p>
    </div>
    {connection.connected && <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#dce7dc] bg-[#f4f8f1] p-3 text-xs text-[#35645f]"><MessageCircle size={16} /><p><b>{connection.botName}</b> is connected to chat <span className="mono">{connection.chatId}</span>. Enter a new token only if you want to replace it.</p></div>}
    <div className="space-y-4">
      <FormField label="Telegram bot token" hint="stored by the future backend, never shown again"><input data-testid="input-telegram-token" type="password" autoComplete="new-password" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder="123456:AA…" className={inputClass} /></FormField>
      <FormField label="User or group chat ID"><input data-testid="input-telegram-chat-id" inputMode="numeric" value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="-1001234567890" className={inputClass} /></FormField>
    </div>
    <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-[#7d8580]"><KeyRound size={14} className="mt-0.5 shrink-0 text-[#b24c3c]" />Demo mode keeps only the connection status and chat ID in memory. A production backend must store the token in protected server-side secrets.</p>
    {error && <div data-testid="status-telegram-error" className="mt-4 flex items-center gap-2 rounded-lg bg-[#f8e0d5] px-3 py-2.5 text-xs font-bold text-[#943a2f]"><AlertCircle size={15} />{error}</div>}
    <div className="mt-6 flex justify-end gap-2 border-t border-[#ebe7dc] pt-5"><button data-testid="button-cancel-telegram-setup" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-bold text-[#68716d] hover:bg-[#f0eee7]">Cancel</button><button data-testid="button-save-telegram-setup" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[#bd553f] px-5 py-2.5 text-sm font-extrabold text-[#fffaf2] shadow-[0_4px_10px_rgba(189,85,63,.18)] transition hover:bg-[#a94535] disabled:cursor-wait disabled:opacity-60">{saving ? 'Connecting…' : connection.connected ? 'Replace connection' : 'Save Telegram connection'}</button></div>
  </Modal>;
}

function AlertEditor({ initial, isTemplate, telegramConnection, onConfigureTelegram, onSave, onClose }: { initial: KeywordAlert | null; isTemplate?: boolean; telegramConnection: TelegramConnection; onConfigureTelegram: () => void; onSave: (alert: KeywordAlert) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<AlertFormState>(initial ? { ...initial, id: undefined, matchCount: undefined, lastMatch: undefined, createdAt: undefined } as unknown as AlertFormState : defaultDraft());
  const [keywordInput, setKeywordInput] = useState('');
  const [phraseQuery, setPhraseQuery] = useState('');
  const [phraseCategory, setPhraseCategory] = useState('All categories');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState('');
  const update = <K extends keyof AlertFormState>(key: K, value: AlertFormState[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const addKeywordValue = (rawValue: string) => {
    const value = rawValue.replace(/\s+/g, ' ').trim();
    if (!value || draft.keywords.some((keyword) => keyword.toLowerCase() === value.toLowerCase())) return;
    update('keywords', [...draft.keywords, value]);
  };
  const addKeyword = () => { addKeywordValue(keywordInput); setKeywordInput(''); };
  const addPresetPhrases = (phrases: readonly string[]) => {
    const existing = new Set(draft.keywords.map((keyword) => keyword.toLowerCase()));
    const additions = phrases.filter((phrase) => !existing.has(phrase.toLowerCase()));
    if (additions.length) update('keywords', [...draft.keywords, ...additions]);
  };
  const filteredPhraseGroups = useMemo(() => businessPhraseGroups
    .filter((group) => phraseCategory === 'All categories' || group.label === phraseCategory)
    .map((group) => ({
      ...group,
      phrases: group.phrases.filter((phrase) => phrase.toLowerCase().includes(phraseQuery.trim().toLowerCase())),
    }))
    .filter((group) => group.phrases.length > 0), [phraseCategory, phraseQuery]);
  const removeKeyword = (value: string) => update('keywords', draft.keywords.filter((word) => word !== value));
  const toggleChannel = (channel: NotificationChannel) => update('channels', draft.channels.includes(channel) ? draft.channels.filter((item) => item !== channel) : [...draft.channels, channel]);
  const submit = () => {
    if (!draft.name.trim()) return setError('Name this rule so an operator can recognize it quickly.');
    if (!draft.keywords.length) return setError('Add at least one keyword or phrase.');
    if (!draft.channels.length) return setError('Choose at least one notification destination.');
    if (draft.channels.includes('telegram') && !telegramConnection.connected) return setError('Connect Telegram once before saving an alert that uses it.');
    const now = new Date();
    onSave({ ...(initial ?? { id: `alert-${Date.now()}`, matchCount: 0, lastMatch: null, createdAt: now.toISOString().slice(0, 10) }), ...draft, name: draft.name.trim(), description: draft.description.trim() });
  };
  return <Modal title={isTemplate ? 'Customize template' : initial ? 'Edit keyword alert' : 'Create keyword alert'} eyebrow={isTemplate ? 'Template copy · independent draft' : initial ? 'Rule configuration' : 'New signal'} onClose={onClose} wide>
    {isTemplate && <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#ead7a9] bg-[#fff8dd] p-3 text-xs text-[#725b23]"><Sparkles size={16} className="mt-0.5 shrink-0" /><p>This is an editable copy. The built-in template stays unchanged until you save a new alert.</p></div>}
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-4">
        <FormField label="Alert name"><input data-testid="input-alert-name" value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Executive escalation" className={inputClass} /></FormField>
        <FormField label="Description" hint="optional"><textarea data-testid="input-alert-description" value={draft.description} onChange={(e) => update('description', e.target.value)} placeholder="What does this rule protect?" rows={3} className={`${inputClass} resize-none`} /></FormField>
        <div className="grid grid-cols-2 gap-3"><FormField label="Severity"><select data-testid="select-alert-severity" value={draft.severity} onChange={(e) => update('severity', e.target.value as AlertSeverity)} className={inputClass}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></FormField><FormField label="Match mode"><select data-testid="select-alert-mode" value={draft.mode} onChange={(e) => update('mode', e.target.value as RuleMode)} className={inputClass}><option value="exact">Exact word</option><option value="phrase">Exact phrase</option><option value="contains">Contains</option><option value="regex">Regex</option></select></FormField></div>
        <FormField label="Keywords & phrases" hint={`${draft.keywords.length} selected · choose a preset or type your own`}><div className={`${inputClass} flex min-h-[45px] flex-wrap gap-1.5 p-2`}><>{draft.keywords.map((word) => <span key={word} className="inline-flex items-center gap-1 rounded-md bg-[#f5e1d9] px-2 py-1 text-xs font-bold text-[#934735]">{word}<button data-testid={`button-remove-keyword-${word}`} onClick={() => removeKeyword(word)} aria-label={`Remove ${word}`} className="hover:text-[#6e2c22]"><X size={12} /></button></span>)}</><input data-testid="input-keyword" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(); } }} onBlur={addKeyword} placeholder={draft.keywords.length ? 'Type a custom phrase…' : 'Type a phrase or choose below'} className="min-w-[150px] flex-1 bg-transparent px-1 py-1 text-xs outline-none" /></div>
          <div className="mt-2 rounded-xl border border-[#e0dbcf] bg-[#f8f7f1] p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8e9690]" />
                <input data-testid="input-search-business-phrases" value={phraseQuery} onChange={(event) => setPhraseQuery(event.target.value)} placeholder="Search business phrases…" className={`${inputClass} py-2 pl-8 text-xs`} />
              </div>
              <select data-testid="select-business-phrase-category" value={phraseCategory} onChange={(event) => setPhraseCategory(event.target.value)} className={`${inputClass} py-2 text-xs sm:w-44`}>
                <option>All categories</option>
                {businessPhraseGroups.map((group) => <option key={group.label}>{group.label}</option>)}
              </select>
            </div>
            <div className="mt-3 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {filteredPhraseGroups.length ? filteredPhraseGroups.flatMap((group) => group.phrases).map((phrase) => {
                const selected = draft.keywords.some((keyword) => keyword.toLowerCase() === phrase.toLowerCase());
                return <button data-testid={`button-preset-phrase-${phrase.replace(/\s+/g, '-').toLowerCase()}`} key={phrase} type="button" aria-pressed={selected} onClick={() => addPresetPhrases([phrase])} className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${selected ? 'border-[#bd553f] bg-[#f5e1d9] text-[#934735]' : 'border-[#ddd8ca] bg-[#fffdf8] text-[#59605d] hover:border-[#bd553f] hover:text-[#934735]'}`}>{selected ? 'Selected · ' : '+'}{phrase}</button>;
              }) : <p className="px-1 py-2 text-[11px] text-[#818883]">No preset phrases match that search. Type a custom phrase above instead.</p>}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#e5e0d5] pt-2">
              <p className="text-[10px] text-[#818883]">Presets are suggestions. You can combine them with custom phrases.</p>
              <button data-testid="button-add-visible-phrases" type="button" onClick={() => addPresetPhrases(filteredPhraseGroups.flatMap((group) => group.phrases))} className="shrink-0 text-[11px] font-extrabold text-[#a94736] hover:underline">Add visible</button>
            </div>
          </div>
        </FormField>
        <div><span className="text-xs font-extrabold text-[#394342]">Match logic</span><div className="mt-2 flex rounded-lg border border-[#d8d2c4] bg-[#fbfaf5] p-1">{(['any', 'all', 'advanced'] as MatchLogic[]).map((logic) => <button data-testid={`button-logic-${logic}`} key={logic} onClick={() => { update('logic', logic); setAdvanced(logic === 'advanced'); }} className={`flex-1 rounded-md px-2 py-2 text-xs font-bold capitalize transition ${draft.logic === logic ? 'bg-[#263b45] text-[#fffaf2]' : 'text-[#65706d] hover:bg-[#eeeae1]'}`}>{logic}</button>)}</div>{advanced && <p className="mt-2 text-[11px] text-[#78817d]">Visual rule builder: <b className="text-[#394342]">subject OR body</b> must contain a phrase, then <b className="text-[#394342]">sender</b> must match.</p>}</div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[#59605d]"><input data-testid="checkbox-case-sensitive" type="checkbox" checked={draft.caseSensitive} onChange={(e) => update('caseSensitive', e.target.checked)} className="h-4 w-4 accent-[#bd553f]" /> Case sensitive matching</label>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-[#e1ddd2] bg-[#f8f7f1] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-extrabold text-[#394342]"><Inbox size={15} className="text-[#b24c3c]" />Mailbox scope</div><div className="space-y-3"><FormField label="Mailbox"><select data-testid="select-mailbox" value={draft.mailbox} onChange={(e) => update('mailbox', e.target.value)} className={inputClass}><option>All controlled mailboxes</option><option>finance@northstar.local</option><option>security@northstar.local</option><option>legal@northstar.local</option><option>support@northstar.local</option></select></FormField><FormField label="Folder"><select data-testid="select-folder" value={draft.folder} onChange={(e) => update('folder', e.target.value)} className={inputClass}><option>Inbox</option><option>Priority</option><option>All Mail</option><option>Sent</option></select></FormField></div></div>
        <div className="rounded-xl border border-[#e1ddd2] bg-[#f8f7f1] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-extrabold text-[#394342]"><Settings2 size={15} className="text-[#b24c3c]" />Field patterns <span className="font-normal text-[#8b918d]">optional</span></div><div className="grid gap-3 sm:grid-cols-2"><FormField label="Sender"><input data-testid="input-sender-pattern" value={draft.senderPattern} onChange={(e) => update('senderPattern', e.target.value)} placeholder="@vendor.local" className={inputClass} /></FormField><FormField label="Recipient"><input data-testid="input-recipient-pattern" value={draft.recipientPattern} onChange={(e) => update('recipientPattern', e.target.value)} placeholder="team@" className={inputClass} /></FormField><FormField label="Subject"><input data-testid="input-subject-pattern" value={draft.subjectPattern} onChange={(e) => update('subjectPattern', e.target.value)} placeholder="invoice|payment" className={inputClass} /></FormField><FormField label="Attachment"><input data-testid="input-attachment-pattern" value={draft.attachmentPattern} onChange={(e) => update('attachmentPattern', e.target.value)} placeholder=".pdf|notice" className={inputClass} /></FormField></div><div className="mt-3"><FormField label="Body"><input data-testid="input-body-pattern" value={draft.bodyPattern} onChange={(e) => update('bodyPattern', e.target.value)} placeholder="Optional message body pattern" className={inputClass} /></FormField></div></div>
        <div className="rounded-xl border border-[#e1ddd2] bg-[#f8f7f1] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-extrabold text-[#394342]"><Bell size={15} className="text-[#b24c3c]" />Notifications & guardrails</div><div className="flex flex-wrap gap-2">{(['in-app', 'email', 'webhook', 'telegram'] as NotificationChannel[]).map((channel) => <button data-testid={`button-channel-${channel}`} key={channel} onClick={() => toggleChannel(channel)} className={`rounded-lg border px-2.5 py-2 text-xs font-bold transition ${draft.channels.includes(channel) ? 'border-[#bd553f] bg-[#f5e1d9] text-[#934735]' : 'border-[#d8d2c4] text-[#7b827e] hover:bg-[#eeeae1]'}`}>{channel === 'in-app' ? 'In-app' : channel[0].toUpperCase() + channel.slice(1)}</button>)}</div><div className="mt-3"><FormField label="Sysadmin email"><input data-testid="input-sysadmin-email" type="email" value={draft.sysadminEmail} onChange={(e) => update('sysadminEmail', e.target.value)} placeholder="ops@northstar.local" className={inputClass} /></FormField></div>{draft.channels.includes('telegram') && <div className={`mt-3 rounded-lg border p-3 ${telegramConnection.connected ? 'border-[#cfe0d3] bg-[#f1f7f2]' : 'border-[#ead7a9] bg-[#fff8dd]'}`}><div className="flex items-start gap-3"><MessageCircle size={16} className={`mt-0.5 shrink-0 ${telegramConnection.connected ? 'text-[#2d6b4c]' : 'text-[#9c7129]'}`} /><div className="min-w-0 flex-1"><p className="text-xs font-extrabold text-[#394342]">{telegramConnection.connected ? `Connected to ${telegramConnection.botName}` : 'Telegram setup required'}</p><p className="mt-1 text-[11px] leading-relaxed text-[#737a77]">{telegramConnection.connected ? `Alerts will reuse chat ${telegramConnection.chatId}. The bot token is protected and never repeated here.` : 'Set the bot token and user chat ID once for this workspace. Every alert can reuse the connection.'}</p></div><button data-testid="button-configure-telegram" type="button" onClick={onConfigureTelegram} className="shrink-0 text-[11px] font-extrabold text-[#a94736] hover:underline">{telegramConnection.connected ? 'Change' : 'Set up'}</button></div></div>}<div className="mt-3"><FormField label="Cooldown" hint="minutes · duplicate prevention"><input data-testid="input-cooldown" type="number" min="0" value={draft.cooldown} onChange={(e) => update('cooldown', Number(e.target.value))} className={inputClass} /></FormField></div></div>
      </div>
    </div>
    {error && <div data-testid="status-form-error" className="mt-5 flex items-center gap-2 rounded-lg bg-[#f8e0d5] px-3 py-2.5 text-xs font-bold text-[#943a2f]"><AlertCircle size={15} />{error}</div>}
    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-[#ebe7dc] pt-5 sm:flex-row sm:justify-end"><button data-testid="button-cancel-editor" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-bold text-[#68716d] hover:bg-[#f0eee7]">Cancel</button><button data-testid="button-save-alert" onClick={submit} className="rounded-lg bg-[#bd553f] px-5 py-2.5 text-sm font-extrabold text-[#fffaf2] shadow-[0_4px_10px_rgba(189,85,63,.18)] transition hover:bg-[#a94535]">{isTemplate ? 'Save as new alert' : 'Save alert'}</button></div>
  </Modal>;
}

function DryRunModal({ alert, onClose }: { alert: KeywordAlert; onClose: () => void }) {
  const [sample, setSample] = useState({ sender: 'treasury@northstar.local', recipient: alert.mailbox, subject: 'Urgent payment hold — vendor 8821', body: 'Please review the wire transfer approval before 17:00.', attachment: 'approval.pdf' });
  const [result, setResult] = useState<{ matched: boolean; explanation: string; field: string } | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => { setRunning(true); setResult(null); await new Promise((resolve) => setTimeout(resolve, 420)); setResult(await keywordAlertService.runDryTest(alert, sample)); setRunning(false); };
  return <Modal title="Dry-run test" eyebrow="Local simulation · no notifications sent" onClose={onClose}><div className="mb-5 rounded-xl border border-[#cfdedc] bg-[#edf5f2] p-3 text-xs text-[#35645f]"><div className="flex items-center gap-2 font-extrabold"><Zap size={15} />Testing “{alert.name}”</div><p className="mt-1 pl-5">Uses local demo content only. This will not poll a mailbox or contact a destination.</p></div><div className="space-y-3"><FormField label="Sender"><input data-testid="input-dry-sender" value={sample.sender} onChange={(e) => setSample({ ...sample, sender: e.target.value })} className={inputClass} /></FormField><FormField label="Recipient"><input data-testid="input-dry-recipient" value={sample.recipient} onChange={(e) => setSample({ ...sample, recipient: e.target.value })} className={inputClass} /></FormField><FormField label="Subject"><input data-testid="input-dry-subject" value={sample.subject} onChange={(e) => setSample({ ...sample, subject: e.target.value })} className={inputClass} /></FormField><FormField label="Body"><textarea data-testid="input-dry-body" value={sample.body} onChange={(e) => setSample({ ...sample, body: e.target.value })} rows={3} className={`${inputClass} resize-none`} /></FormField><FormField label="Attachment name"><input data-testid="input-dry-attachment" value={sample.attachment} onChange={(e) => setSample({ ...sample, attachment: e.target.value })} className={inputClass} /></FormField></div>{result && <div data-testid="status-dry-run-result" className={`mt-5 rounded-xl border p-4 ${result.matched ? 'border-[#b9d8c4] bg-[#edf5f0] text-[#2d6b4c]' : 'border-[#ddd8ca] bg-[#f5f3ed] text-[#5d6662]'}`}><div className="flex items-center gap-2 text-sm font-extrabold">{result.matched ? <Check size={17} /> : <CircleHelp size={17} />}{result.matched ? 'Match found' : 'No match'}</div><p className="mt-1 text-xs">{result.explanation}</p><p className="mt-2 text-[11px] font-bold uppercase tracking-wider opacity-70">Field: {result.field} · Mode: {alert.mode}</p></div>}<div className="mt-6 flex justify-end"><button data-testid="button-run-dry-test" onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-[#263b45] px-5 py-2.5 text-sm font-extrabold text-[#fffaf2] transition hover:bg-[#1c303a] disabled:cursor-wait disabled:opacity-60">{running ? 'Checking local sample…' : 'Run local test'}<Zap size={15} /></button></div></Modal>;
}

function TemplateLibrary({ onUse }: { onUse: (template: KeywordAlert) => void }) {
  const templates = demoAlerts.slice(0, 3);
  return <section data-testid="section-template-library" className="mt-8 rounded-2xl border border-[#ddd8ca] bg-[#f8f6ef] p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-[#b24c3c]">Starter patterns</p><h2 className="mt-1 text-lg font-extrabold text-[#252c38]">Template library</h2><p className="mt-1 text-xs text-[#7b827e]">Start with a proven signal, then tailor every field before saving.</p></div><Badge><BookOpen size={12} /> Built-in · read-only</Badge></div><div className="mt-5 grid gap-3 lg:grid-cols-3">{templates.map((template) => <div data-testid={`card-template-${template.id}`} key={template.id} className="rounded-xl border border-[#e0dbcf] bg-[#fffdf8] p-4 transition hover:-translate-y-0.5 hover:border-[#c6b9a5]"><div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f5e1d9] text-[#b24c3c]"><ShieldAlert size={17} /></div><SeverityBadge severity={template.severity} /></div><h3 className="mt-3 text-sm font-extrabold text-[#303944]">{template.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#7b827e]">{template.description}</p><button data-testid={`button-use-template-${template.id}`} onClick={() => onUse(structuredClone(template))} className="mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-[#a94736] hover:text-[#7e3328]">Customize template <ChevronRight size={14} /></button></div>)}</div></section>;
}

function EventHistory({ events }: { events: AlertEvent[] }) {
  return <section className="mt-8 rounded-2xl border border-[#ddd8ca] bg-[#fffdf8]"><div className="flex items-center justify-between border-b border-[#ebe7dc] px-5 py-4"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-[#b24c3c]">Recent activity</p><h2 className="mt-1 text-lg font-extrabold text-[#252c38]">Event history</h2></div><button data-testid="button-view-all-events" className="text-xs font-extrabold text-[#a94736] hover:underline">View all <SquareArrowOutUpRight size={13} className="ml-1 inline" /></button></div><div className="divide-y divide-[#eeeae1]">{events.map((event) => <div data-testid={`event-${event.id}`} key={event.id} className="flex gap-3 px-5 py-4"><div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f5e1d9] text-[#b24c3c]"><Zap size={13} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="truncate text-xs font-extrabold text-[#394342]">{event.subject}</p><span className="mono text-[10px] text-[#929893]">{event.timestamp}</span></div><p className="mt-1 text-[11px] text-[#7b827e]">{event.sender} <span className="px-1 text-[#bcb8ad]">→</span> {event.mailbox}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#a94736]">Matched “{event.matched}” · {event.channel}</p></div></div>)}</div></section>;
}

export default function KeywordAlert() {
  const [alerts, setAlerts] = useState<KeywordAlert[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<'all' | AlertSeverity>('all');
  const [status, setStatus] = useState<'all' | 'enabled' | 'paused'>('all');
  const [editor, setEditor] = useState<{ alert: KeywordAlert | null; template: boolean } | null>(null);
  const [dryRun, setDryRun] = useState<KeywordAlert | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [nav, setNav] = useState('Alerts');
  const [telegramConnection, setTelegramConnection] = useState<TelegramConnection>({ connected: false, chatId: '', botName: '', configuredAt: null });
  const [telegramSetupOpen, setTelegramSetupOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([keywordAlertService.listAlerts(), keywordAlertService.listEvents(), keywordAlertService.getTelegramConnection()])
      .then(([nextAlerts, nextEvents, connection]) => {
        setAlerts(nextAlerts);
        setEvents(nextEvents);
        setTelegramConnection(connection);
      })
      .catch(() => toast("Could not load alert data. Is the backend running?", "neutral"))
      .finally(() => setLoading(false));
  }, []);
  const toast = (message: string, tone: Toast['tone'] = 'good') => { const id = Date.now(); setToasts((current) => [...current, { id, message, tone }]); window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3200); };
  const filtered = useMemo(() => alerts.filter((alert) => (severity === 'all' || alert.severity === severity) && (status === 'all' || (status === 'enabled' ? alert.enabled : !alert.enabled)) && `${alert.name} ${alert.description} ${alert.keywords.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [alerts, query, severity, status]);
  const saveTelegramConnection = async (input: TelegramSetupInput) => {
    const connection = await keywordAlertService.saveTelegramConnection(input);
    setTelegramConnection(connection);
    toast('Telegram connection saved for this workspace.');
  };
  const saveAlert = async (alert: KeywordAlert) => {
    setLoading(true);
    try {
      const saved = await keywordAlertService.saveAlert(alert);
      setAlerts((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      toast(alert.matchCount ? 'Alert updated and ready.' : 'New alert saved.');
      setEditor(null);
    } catch (err: unknown) {
      toast((err instanceof Error ? err.message : 'Could not save alert.') ?? 'Could not save alert.', 'neutral');
    } finally {
      setLoading(false);
    }
  };
  const deleteAlert = async () => { if (!deleteId) return; const alert = alerts.find((item) => item.id === deleteId); await keywordAlertService.deleteAlert(deleteId); setAlerts((current) => current.filter((item) => item.id !== deleteId)); setDeleteId(null); toast(`${alert?.name ?? 'Alert'} deleted.`, 'neutral'); };
  const toggleAlert = async (alert: KeywordAlert) => {
    const next = { ...alert, enabled: !alert.enabled };
    try {
      const saved = await keywordAlertService.saveAlert(next);
      setAlerts((current) => current.map((item) => item.id === saved.id ? saved : item));
      toast(`${alert.name} ${saved.enabled ? 'enabled' : 'paused'}.`);
    } catch {
      toast(`Could not ${alert.enabled ? 'pause' : 'enable'} ${alert.name}.`, 'neutral');
    }
  };
  const duplicateAlert = (alert: KeywordAlert) => setEditor({ alert: { ...structuredClone(alert), id: `alert-${Date.now()}`, name: `${alert.name} copy`, matchCount: 0, lastMatch: null }, template: false });
  const totalMatches = alerts.reduce((sum, alert) => sum + alert.matchCount, 0);
  return <div className="noise min-h-[100dvh] bg-[#f1efe7] text-[#252c38]">
    <div className="flex min-h-[100dvh]">
      <aside className="hidden w-[236px] shrink-0 flex-col bg-[#202f39] text-[#dfe8e5] lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-[#3b4b52] px-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c65b45] text-[#fffaf2] shadow-[0_5px_16px_rgba(198,91,69,.22)]"><Zap size={18} fill="currentColor" /></div><div><p className="text-sm font-extrabold tracking-tight">Keyword Alerts</p><p className="mono mt-0.5 text-[9px] uppercase tracking-[.14em] text-[#91aaa4]">Operations console</p></div></div>
         <nav className="flex-1 space-y-1 px-3 py-6">{[{ label: 'Overview', icon: LayoutDashboard }, { label: 'Alerts', icon: Bell }, { label: 'Templates', icon: BookOpen }, { label: 'Settings', icon: Settings2 }].map(({ label, icon: Icon }) => <button data-testid={`nav-${label.toLowerCase()}`} key={label} onClick={() => { setNav(label); if (label === 'Templates') document.getElementById('templates')?.scrollIntoView({ behavior: 'smooth' }); if (label === 'Settings') setTelegramSetupOpen(true); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition ${nav === label ? 'bg-[#30434e] text-[#fffaf2]' : 'text-[#a9b9b5] hover:bg-[#293c46] hover:text-[#e4ece8]'}`}><Icon size={17} /><span>{label}</span>{label === 'Alerts' && <span className="mono ml-auto text-[10px] text-[#ef9b83]">{alerts.length}</span>}</button>)}</nav>
        <div className="m-4 rounded-xl border border-[#3c5157] bg-[#293c46] p-4"><div className="flex items-center gap-2 text-xs font-extrabold"><span className="h-2 w-2 rounded-full bg-[#64c493]" />System healthy</div><p className="mt-2 text-[11px] leading-relaxed text-[#9eb2ad]">Watching configured alert rules.</p></div>
        <div className="border-t border-[#3b4b52] px-5 py-4"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e6c795] text-xs font-extrabold text-[#4e3c27]">SA</div><div><p className="text-xs font-bold text-[#e1e9e6]">System admin</p><p className="text-[10px] text-[#8ea29d]">Local workspace</p></div></div></div>
      </aside>
      <main className="min-w-0 flex-1">
         <header className="flex h-20 items-center justify-between border-b border-[#ded9cd] bg-[#f5f3ec]/90 px-5 backdrop-blur sm:px-8"><div className="flex items-center gap-3 lg:hidden"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c65b45] text-[#fffaf2]"><Zap size={16} fill="currentColor" /></div><span className="text-sm font-extrabold">Keyword Alerts</span></div><div className="hidden items-center gap-2 text-xs text-[#7d8580] sm:flex"><span className="mono text-[10px] uppercase tracking-[.16em] text-[#a94736]">Workspace</span><ChevronRight size={13} /><span>Signal monitoring</span></div><div className="flex items-center gap-2"><button data-testid="button-header-telegram-settings" onClick={() => setTelegramSetupOpen(true)} className="hidden items-center gap-1.5 rounded-lg border border-[#dcd7ca] px-2.5 py-2 text-[11px] font-extrabold text-[#59605d] hover:bg-[#e8e5db] sm:inline-flex"><MessageCircle size={14} />{telegramConnection.connected ? 'Telegram connected' : 'Set up Telegram'}</button><button data-testid="button-help" aria-label="Help" className="rounded-lg p-2 text-[#69736e] hover:bg-[#e8e5db]"><CircleHelp size={18} /></button></div></header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="signal-in flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mono text-[10px] uppercase tracking-[.2em] text-[#b24c3c]">Control room / rules</p><h1 data-testid="text-page-title" className="mt-2 text-[clamp(2rem,3vw,3rem)] font-extrabold tracking-[-.05em] text-[#202c38]">Keyword alerts</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6f7874]">Catch the messages that change the day. Keep urgent signals visible across every controlled mailbox.</p></div><button data-testid="button-create-alert" onClick={() => setEditor({ alert: null, template: false })} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#bd553f] px-4 py-3 text-sm font-extrabold text-[#fffaf2] shadow-[0_7px_18px_rgba(189,85,63,.18)] transition hover:-translate-y-0.5 hover:bg-[#a94535]"><Plus size={17} />Create alert</button></div>
          <div className="signal-in signal-delay-1 mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div data-testid="metric-active-rules" className="rounded-2xl border border-[#ddd8ca] bg-[#fffdf8] p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#7b827e]">Active rules</span><span className="rounded-lg bg-[#dcebe0] p-2 text-[#347451]"><ShieldAlert size={15} /></span></div><p className="mt-3 text-2xl font-extrabold tracking-tight text-[#25323c]">{alerts.filter((a) => a.enabled).length}<span className="ml-1 text-sm font-semibold text-[#919792]">/ {alerts.length}</span></p><p className="mt-1 text-[11px] text-[#7b827e]">Watching configured scopes</p></div><div data-testid="metric-matches-today" className="rounded-2xl border border-[#ddd8ca] bg-[#fffdf8] p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#7b827e]">Matches today</span><span className="rounded-lg bg-[#f5e1d9] p-2 text-[#b24c3c]"><Zap size={15} /></span></div><p className="mt-3 text-2xl font-extrabold tracking-tight text-[#25323c]">{totalMatches}<span className="ml-2 text-xs font-semibold text-[#3b9a76]">+12%</span></p><p className="mt-1 text-[11px] text-[#7b827e]">Across demo event stream</p></div><div data-testid="metric-unread-signals" className="rounded-2xl border border-[#ddd8ca] bg-[#fffdf8] p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#7b827e]">Unreviewed signals</span><span className="rounded-lg bg-[#f3dfbd] p-2 text-[#9c7129]"><AlertCircle size={15} /></span></div><p className="mt-3 text-2xl font-extrabold tracking-tight text-[#25323c]">06</p><p className="mt-1 text-[11px] text-[#7b827e]">2 critical · 4 high priority</p></div><div data-testid="metric-destinations" className="rounded-2xl border border-[#ddd8ca] bg-[#fffdf8] p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#7b827e]">Destinations</span><span className="rounded-lg bg-[#d5e6e5] p-2 text-[#2d7376]"><Webhook size={15} /></span></div><p className="mt-3 text-2xl font-extrabold tracking-tight text-[#25323c]">07</p><p className="mt-1 text-[11px] text-[#7b827e]">In-app, email, webhook</p></div></div>
          <section className="signal-in signal-delay-2 mt-7 rounded-2xl border border-[#ddd8ca] bg-[#fffdf8] shadow-[0_3px_12px_rgba(48,54,55,.04)]"><div className="flex flex-col gap-4 border-b border-[#ebe7dc] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="relative min-w-0 flex-1 sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8e9690]" /><input data-testid="input-search-alerts" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search rules, phrases, mailboxes…" className="w-full rounded-lg border border-[#dcd7ca] bg-[#fbfaf5] py-2.5 pl-9 pr-3 text-xs text-[#252c38] outline-none focus:border-[#bd553f] focus:ring-2 focus:ring-[#bd553f]/15" /></div><div className="flex items-center gap-2"><button data-testid="button-mobile-filters" onClick={() => setShowMobileFilters(!showMobileFilters)} className="inline-flex items-center gap-2 rounded-lg border border-[#dcd7ca] px-3 py-2.5 text-xs font-bold text-[#59605d] hover:bg-[#f0eee7] sm:hidden"><Filter size={14} />Filters</button><div className={`${showMobileFilters ? 'flex' : 'hidden'} flex-1 gap-2 sm:flex`}><select data-testid="select-filter-severity" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="rounded-lg border border-[#dcd7ca] bg-[#fbfaf5] px-3 py-2.5 text-xs font-bold text-[#59605d] outline-none"><option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><select data-testid="select-filter-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-[#dcd7ca] bg-[#fbfaf5] px-3 py-2.5 text-xs font-bold text-[#59605d] outline-none"><option value="all">All status</option><option value="enabled">Enabled</option><option value="paused">Paused</option></select></div></div></div><div className="hidden grid-cols-[minmax(260px,1.5fr)_120px_minmax(180px,1fr)_150px_110px_42px] gap-4 bg-[#f8f7f1] px-5 py-3 text-[10px] font-extrabold uppercase tracking-[.12em] text-[#929893] md:grid"><span>Alert rule</span><span>Priority</span><span>Keywords</span><span>Scope</span><span>Activity</span><span /></div>{loading ? <div data-testid="status-loading-alerts" className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-[#eeeae1]" />)}</div> : filtered.length ? <><div className="hidden md:block">{filtered.map((alert) => <AlertRow key={alert.id} alert={alert} onEdit={() => setEditor({ alert, template: false })} onDuplicate={() => duplicateAlert(alert)} onDelete={() => setDeleteId(alert.id)} onToggle={() => toggleAlert(alert)} onDryRun={() => setDryRun(alert)} />)}</div><div className="grid gap-3 p-4 md:hidden">{filtered.map((alert) => <AlertCard key={alert.id} alert={alert} onEdit={() => setEditor({ alert, template: false })} onDuplicate={() => duplicateAlert(alert)} onDelete={() => setDeleteId(alert.id)} onToggle={() => toggleAlert(alert)} onDryRun={() => setDryRun(alert)} />)}</div></> : <div className="p-5"><EmptyState onCreate={() => setEditor({ alert: null, template: false })} /></div>}<div className="flex items-center justify-between border-t border-[#ebe7dc] px-5 py-3 text-[11px] text-[#89908c]"><span data-testid="text-filter-count">Showing {filtered.length} of {alerts.length} rules</span><span className="mono">LOCAL / DEMO</span></div></section>
          <div id="templates"><TemplateLibrary onUse={(template) => setEditor({ alert: template, template: true })} /></div>
          <EventHistory events={events} />
          <footer className="flex flex-col gap-2 py-8 text-[11px] text-[#8a918d] sm:flex-row sm:items-center sm:justify-between"><span>Keyword Alerts <span className="px-1">·</span> Operations console</span><span className="mono">No mailbox polling · No real notifications</span></footer>
        </div>
      </main>
    </div>
     {editor && <AlertEditor initial={editor.alert} isTemplate={editor.template} telegramConnection={telegramConnection} onConfigureTelegram={() => setTelegramSetupOpen(true)} onClose={() => setEditor(null)} onSave={saveAlert} />}
    {dryRun && <DryRunModal alert={dryRun} onClose={() => setDryRun(null)} />}
     {telegramSetupOpen && <TelegramSetupModal connection={telegramConnection} onClose={() => setTelegramSetupOpen(false)} onSave={saveTelegramConnection} />}
    {deleteId && <Modal title="Delete this alert?" eyebrow="Destructive action" onClose={() => setDeleteId(null)}><p className="text-sm leading-relaxed text-[#69736e]">This removes the alert and its match history. Event history stays visible.</p><div className="mt-6 flex justify-end gap-2"><button data-testid="button-cancel-delete" onClick={() => setDeleteId(null)} className="rounded-lg px-4 py-2.5 text-sm font-bold text-[#68716d] hover:bg-[#f0eee7]">Cancel</button><button data-testid="button-confirm-delete" onClick={deleteAlert} className="rounded-lg bg-[#a44135] px-4 py-2.5 text-sm font-extrabold text-[#fffaf2] hover:bg-[#8d382f]">Delete alert</button></div></Modal>}
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">{toasts.map((item) => <div data-testid={`toast-${item.id}`} key={item.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-bold shadow-[0_12px_30px_rgba(36,44,56,.14)] ${item.tone === 'good' ? 'border-[#b9d8c4] bg-[#edf5f0] text-[#2d6b4c]' : 'border-[#ddd8ca] bg-[#fffdf8] text-[#59605d]'}`}><Check size={15} />{item.message}</div>)}</div>
  </div>;
}