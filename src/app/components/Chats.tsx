import { useEffect, useState } from 'react';
import { Search, Send, Paperclip, MessageCircle, Bot, Check, CheckCheck, Plus, X, Play, Pause, Edit2, Trash2, Copy, Users, TrendingUp, Calendar, Clock, Zap, MessageSquare, Settings, BarChart3, Eye, ArrowRight, Circle, ShoppingCart, ExternalLink, Phone, Mic, FileText, Image as ImageIcon, Film, StopCircle, Sparkles, Key, Heart, Hand, AlarmClock, Briefcase, Smile } from 'lucide-react';
import { translations } from '../utils/translations';
import { TextMessage, ImageMessage, FileMessage, VoiceMessage, CallMessage } from './ChatMessageTypes';
import { PlatformIcon } from './PlatformLogos';
import { useDataStore } from '../utils/dataStore';
import { getNiche } from '../utils/niches';
import { NicheIcon } from './NicheIcon';
import { toast } from '../utils/toast';

interface Message {
  id: string;
  text: string;
  time: string;
  isUser: boolean;
  read?: boolean;
  type?: 'text' | 'voice' | 'file' | 'image' | 'video' | 'call';
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: string;
  callStatus?: 'missed' | 'incoming' | 'outgoing' | 'ended';
}

interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  platform: 'whatsapp' | 'instagram' | 'telegram' | 'tiktok';
  online: boolean;
  unreadCount?: number;
  messages: Message[];
  orderId?: string;
}

// Chats start empty — populated only when real messengers are connected via Settings → Integrations.
const mockChats: Chat[] = [];

interface ChatsProps { language: 'kz' | 'ru' | 'eng'; }

// Niche-keyword bank used to suggest the "ключевое слово → запись на замер"
// scenario trigger. The trigger word for furniture is «кухня», for windows
// it's «окно», for ceilings «потолок», etc. We just pick the first niche
// product-type option as the example.
const NICHE_KEYWORD: Record<string, string> = {
  furniture: 'кухня', windows: 'окно', ceilings: 'потолок',
  blinds: 'жалюзи', doors: 'дверь', stairs: 'лестница',
  flooring: 'ламинат', construction: 'ремонт', custom: 'заказ',
};

// Scenario titles use placeholders that we replace with niche-specific
// nouns at render-time. Was hardcoded "кейсы / кухня / модели" before —
// which read fine for a furniture team but broken for windows/doors.
const scenariosData = [
  { id: 'comment_dm',     icon: MessageCircle, titleKey: { ru: 'Комментарий → DM с прайсом', kz: 'Пікір → прайс DM', eng: 'Comment → DM with pricing' },
    descKey: { ru: 'Когда кто-то комментирует пост — автоматически отправляем прайс в Direct', kz: 'Постқа пікір жазғанда прайсты автоматты түрде Direct-ке жібереміз', eng: 'When someone comments on a post, auto-send the pricing in Direct' } },
  { id: 'story_dm',       icon: Heart, titleKey: { ru: 'Реакция на сторис → DM с кейсами', kz: 'Сторис реакциясы → DM', eng: 'Story reaction → DM with cases' },
    descKey: { ru: 'Когда подписчик реагирует на сторис — отправляем подборку наших работ', kz: 'Сторис реакциясы кезінде жұмыс портфолиосын жібереміз', eng: 'When a follower reacts to a story — send a portfolio selection' } },
  { id: 'keyword_measure',icon: Key, titleKey: { ru: 'Ключевое слово → запись на замер', kz: 'Кілт сөз → өлшеу жазу', eng: 'Keyword → measurement booking' },
    descKey: { ru: 'Когда в сообщении есть слова «замер», «цена», «{NICHE_KEYWORD}» — предлагаем записаться', kz: '«өлшеу», «бағасы», «{NICHE_KEYWORD}» сөздері кезінде өлшеуге жазылуды ұсынамыз', eng: 'When the message contains "measurement", "price" or "{NICHE_KEYWORD}" — offer to book' } },
  { id: 'new_follower',   icon: Hand, titleKey: { ru: 'Новый подписчик → приветствие', kz: 'Жаңа жазылушы → сәлемдесу', eng: 'New follower → greeting' },
    descKey: { ru: 'Здороваемся с новыми подписчиками и отправляем подборку популярных работ', kz: 'Жаңа жазылушылармен амандасып, танымал жұмыстарды жібереміз', eng: 'Welcome new followers and send a popular-works selection' } },
  { id: 'abandoned',      icon: AlarmClock, titleKey: { ru: 'Брошенный диалог → напоминание', kz: 'Тасталған диалог → еске салу', eng: 'Abandoned dialog → reminder' },
    descKey: { ru: 'Если клиент не ответил 24 часа — отправляем дружелюбное напоминание', kz: 'Клиент 24 сағат жауап бермесе — досмен еске салу жібереміз', eng: 'If a client hasn\'t replied for 24h — send a friendly reminder' } },
];

export function Chats({ language }: ChatsProps) {
  const store = useDataStore();
  const niche = getNiche(store.niche);
  const chatsLevel = store.getModuleLevel('chats');
  const canWrite = chatsLevel === 'full';
  const nicheKeyword = NICHE_KEYWORD[store.niche] || 'заказ';
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // Niche-aware default for the AI agent's "additional instructions"
  // textarea. Each niche gets a different first sentence so the agent
  // sounds like it actually knows what the team sells. The user can
  // override — this is just the starting point.
  const defaultAiInstructions = (() => {
    const installerRole = niche.roleLabels.installer[language];
    const measurerRole = niche.roleLabels.measurer[language];
    return l(
      `Всегда уточняй параметры заказа (размеры, материалы). При вопросе о цене — отправляй прайс. Если клиент готов к замеру — передавай ${measurerRole.toLowerCase()}у или менеджеру. Готовый заказ — на ${installerRole.toLowerCase()}а.`,
      `Тапсырыс параметрлерін (өлшем, материал) нақтыла. Баға сұрағанда прайсты жібер. Клиент дайын болса — менеджерге бер.`,
      `Always clarify order parameters (sizes, materials). When asked about price — send pricing. When the client is ready — hand off to a manager.`,
    );
  })();

  const [activeTab, setActiveTab] = useState<'chats' | 'ai-agent' | 'automation'>('chats');
  const [aiAgentSubTab, setAiAgentSubTab] = useState<'agent' | 'scenarios'>('agent');
  const [aiAgentEnabled, setAiAgentEnabled] = useState(true);
  const [aiChannels, setAiChannels] = useState({ whatsapp: true, instagram: true, telegram: false });
  const [aiTone, setAiTone] = useState<'professional' | 'friendly' | 'casual'>('friendly');
  const [aiInstructions, setAiInstructions] = useState(defaultAiInstructions);
  // Knowledge files are niche-neutral now ("Прайс / Каталог" instead of
  // "Каталог кухонь.pdf"). Real files come from upload — this is only
  // the placeholder shown when nothing has been uploaded yet.
  const [aiKnowledgeFiles] = useState([l('Прайс-2026.pdf', 'Прайс-2026.pdf', 'Pricing-2026.pdf'), l('Каталог.pdf', 'Каталог.pdf', 'Catalog.pdf')]);
  const [aiTransferConditions, setAiTransferConditions] = useState({ measurement: true, discount: true, unknown: true, longChat: false });
  const [activeScenarios, setActiveScenarios] = useState<Record<string, boolean>>({ comment_dm: true, story_dm: false, keyword_measure: true, new_follower: false, abandoned: false });
  const [scenarioModal, setScenarioModal] = useState<string | null>(null);
  // Default scenario texts are niche-aware. "Мы производим мебель" was
  // hardcoded — now it reads "we make {windows/ceilings/doors/etc}".
  const [scenarioTexts, setScenarioTexts] = useState<Record<string, string>>({
    comment_dm: l('Здравствуйте! 👋 Спасибо за комментарий. Отправляем вам наш актуальный прайс. Если есть вопросы — пишите!',
                  'Сәлеметсіз бе! 👋 Пікіріңізге рахмет. Прайсты жібереміз.',
                  'Hi! 👋 Thanks for the comment. Sending you our current pricing. Questions? Just ask!'),
    story_dm:   l('Здравствуйте! Рады, что вам понравилось 😊 Вот наши лучшие реализованные проекты:',
                  'Сәлеметсіз бе! Ұнағанына қуаныштымыз 😊 Жұмыстарымыздан көрсетейік:',
                  'Hi! Glad you liked it 😊 Here are some of our best projects:'),
    keyword_measure: l('Здравствуйте! Я вижу, вы интересуетесь замером. Хотите записаться на бесплатный замер и консультацию?',
                       'Сәлеметсіз бе! Өлшеуге қызығатыныңызды көрдім. Тегін өлшеу мен кеңеске жазылғыңыз келе ме?',
                       'Hi! I see you\'re interested in a measurement. Want to book a free measurement & consultation?'),
    new_follower: l(`Добро пожаловать! 🏠 Мы — ${niche.name.ru.toLowerCase()} под заказ. Вот наши популярные работы:`,
                    `Қош келдіңіз! 🏠 Біз — ${niche.name.kz.toLowerCase()}. Танымал жұмыстар:`,
                    `Welcome! 🏠 We make custom ${niche.name.eng.toLowerCase()}. Here are popular works:`),
    abandoned: l('Здравствуйте! Мы заметили, что разговор прервался. Можем ли мы помочь вам с выбором? 😊',
                 'Сәлеметсіз бе! Әңгіме үзіліп қалғанын байқадық. Таңдауыңызға көмектесейік пе? 😊',
                 'Hi! We noticed our chat got interrupted. Can we help you with your choice? 😊'),
  });

  const [chats] = useState<Chat[]>(mockChats);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Chat['platform'][]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showCallModal, setShowCallModal] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Pending hand-off from AIDesign — when AI Design fires
  // chats:share-image, we capture the image + caption and hold it as a
  // "draft attachment" until the user picks a chat. As soon as they
  // open a chat, we drop the image+caption into the composer for them.
  const [pendingShare, setPendingShare] = useState<{ imageUrl: string; caption: string; provider: string } | null>(null);
  const [shareBanner, setShareBanner] = useState('');

  // Listen for chats:share-image dispatched by AIDesign lightbox.
  // Stores the image as a "pending share" so the user can pick which
  // chat to send it to. When they open a chat, we drop it in as an
  // image message + prefill the composer with the caption.
  useEffect(() => {
    const onShare = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.imageUrl) return;
      setPendingShare({
        imageUrl: String(detail.imageUrl),
        caption:  String(detail.caption || ''),
        provider: String(detail.provider || ''),
      });
      setActiveTab('chats');
      setShareBanner(l(
        'Концепт готов к отправке. Откройте диалог с клиентом — изображение прикрепится автоматически.',
        'Концепт жіберуге дайын. Клиентпен диалогты ашыңыз.',
        'Concept ready to send. Open a client conversation — the image will attach automatically.',
      ));
    };
    window.addEventListener('chats:share-image', onShare);
    return () => window.removeEventListener('chats:share-image', onShare);
  }, [language]);

  // When a chat is selected and we have a pending share — drop the
  // image into the message list and prefill the composer with the
  // caption so the user just clicks Send.
  const dropPendingShare = (chat: Chat) => {
    if (!pendingShare) return;
    setMessages(prev => [
      ...prev,
      {
        id: String(Date.now()) + '-share',
        text: '',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isUser: false,
        read: false,
        type: 'image',
        fileUrl: pendingShare.imageUrl,
        fileName: `concept-${pendingShare.provider || 'design'}.png`,
      },
    ]);
    if (pendingShare.caption) setNewMessage(pendingShare.caption);
    setPendingShare(null);
    setShareBanner('');
  };

  const platformDot = (p: Chat['platform']) => <PlatformIcon platform={p} size="sm" />;
  const platformName = (p: Chat['platform']) => ({ whatsapp: 'WhatsApp', instagram: 'Instagram', telegram: 'Telegram', tiktok: 'TikTok' }[p]);
  const platformBadge = (p: Chat['platform']) => ({ whatsapp: 'bg-green-50 text-green-700 border-green-200', instagram: 'bg-pink-50 text-pink-700 border-pink-200', telegram: 'bg-blue-50 text-blue-700 border-blue-200', tiktok: 'bg-gray-50 text-slate-700 border-gray-200' }[p]);

  const handleChatSelect = (chat: Chat) => {
    setSelectedChat(chat);
    setMessages(chat.messages);
    // If AIDesign handed us a concept while we were on the list — drop
    // it into this chat as the first thing the user sees.
    if (pendingShare) {
      // Defer one tick so the messages state update from this same call
      // doesn't race the share-drop.
      setTimeout(() => dropPendingShare(chat), 0);
    }
  };
  const handleSendMessage = () => {
    if (newMessage.trim() && selectedChat) {
      setMessages([...messages, { id: String(Date.now()), text: newMessage, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, read: false }]);
      setNewMessage('');
    }
  };
  const togglePlatform = (p: Chat['platform']) => setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const filteredChats = chats.filter(c => {
    const s = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const f = selectedPlatforms.length === 0 || selectedPlatforms.includes(c.platform);
    const u = !showUnreadOnly || (c.unreadCount && c.unreadCount > 0);
    return s && f && u;
  });

  const handleSendFile = (type: 'document' | 'image' | 'video') => {
    const d = { document: { fileName: 'Договор.pdf', fileSize: '1.2 MB', type: 'file' as const }, image: { fileName: 'Дизайн.jpg', fileUrl: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600', type: 'image' as const }, video: { fileName: 'Обзор.mp4', fileSize: '5.8 MB', type: 'video' as const } }[type];
    setMessages([...messages, { id: String(Date.now()), text: '', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, read: false, ...d }]);
    setShowAttachmentMenu(false);
  };
  const startRecording = () => { setIsRecording(true); setRecordingDuration(0); const i = setInterval(() => setRecordingDuration(p => p + 1), 1000); (window as any).recInt = i; };
  const stopRecording = () => { clearInterval((window as any).recInt); setIsRecording(false); };
  const sendVoiceMessage = () => { setMessages([...messages, { id: String(Date.now()), text: '', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, read: false, type: 'voice', duration: `0:${recordingDuration.toString().padStart(2, '0')}` }]); stopRecording(); setRecordingDuration(0); };
  const cancelRecording = () => { stopRecording(); setRecordingDuration(0); };
  const toggleVoicePlay = (id: string) => { if (playingVoiceId === id) setPlayingVoiceId(null); else { setPlayingVoiceId(id); setTimeout(() => setPlayingVoiceId(null), 3000); } };
  const startCall = () => { setShowCallModal(true); setIsInCall(false); setCallDuration(0); setTimeout(() => { setIsInCall(true); const i = setInterval(() => setCallDuration(p => p + 1), 1000); (window as any).callInt = i; }, 2000); };
  const endCall = () => { clearInterval((window as any).callInt); setMessages([...messages, { id: String(Date.now()), text: translations.call[language], time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, read: false, type: 'call', callStatus: 'outgoing', duration: `${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, '0')}` }]); setShowCallModal(false); setIsInCall(false); setCallDuration(0); };
  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const tabItems = [
    { id: 'chats' as const, icon: MessageCircle, label: l('Диалоги', 'Диалогтар', 'Dialogs') },
    { id: 'ai-agent' as const, icon: Bot, label: l('AI-агент', 'AI-агент', 'AI Agent') },
    { id: 'automation' as const, icon: Zap, label: l('Автоматизация', 'Автоматтандыру', 'Automation') },
  ];

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button onClick={onChange} className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-gray-900' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  );

  const currentScenario = scenariosData.find(s => s.id === scenarioModal);

  // ─── Defensive view-gate ────────────────────────────────────────
  // Sidebar hides the link when matrix says 'none' — but deeplinks
  // bypass the sidebar, so render a clean no-access screen instead of
  // a broken composer.
  if (chatsLevel === 'none') {
    return (
      <div className="flex flex-col h-[calc(100vh-56px)] items-center justify-center p-8">
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-10 max-w-md text-center">
          <Eye className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg text-slate-900 mb-1 tracking-tight">
            {l('Нет доступа', 'Қол жетімсіз', 'No access')}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {l(
              'У вашей роли нет прав на чаты с клиентами. Попросите администратора открыть модуль.',
              'Сіздің рөліңізде чат құқығы жоқ.',
              'Your role does not have access to client chats. Ask an admin to enable it.',
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-56px)] relative"
    >
      {/* Header — now carries the niche tag so the user knows which
          business profile drives default scenario texts and AI tone. */}
      <div className="px-4 md:px-6 py-3 border-b border-white/60 bg-white/40 backdrop-blur-2xl flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm text-slate-900 truncate">{l('Омниканальные чаты', 'Омниканалды чаттар', 'Omnichannel Chats')}</div>
          <span className="text-[11px] text-slate-500 whitespace-nowrap hidden sm:inline-flex items-center gap-1">· <NicheIcon niche={niche} className="w-3 h-3" /> {niche.name[language]}</span>
          {!canWrite && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100/60 text-amber-700 ring-1 ring-amber-200/60 whitespace-nowrap">
              {l('Только просмотр', 'Тек көру', 'View only')}
            </span>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {tabItems.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${
                activeTab === t.id
                  ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                  : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Hand-off banner from AIDesign — guide the user to pick a chat */}
      {shareBanner && (
        <div className="px-4 md:px-6 py-2.5 bg-violet-50/70 border-b border-violet-100/60 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ImageIcon className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
            <div className="text-[11px] text-violet-700 truncate">{shareBanner}</div>
          </div>
          <button
            onClick={() => { setPendingShare(null); setShareBanner(''); }}
            className="text-[11px] text-violet-700 hover:text-violet-900 whitespace-nowrap"
          >
            {l('Отменить', 'Бас тарту', 'Cancel')}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* ===== CHATS TAB ===== */}
        {activeTab === 'chats' && (
          <div className="flex h-full">
            {/* Sidebar */}
            <div className={`w-full md:w-80 lg:w-96 border-r border-gray-100 bg-white flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-3 space-y-2 border-b border-white/60 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                  <input type="text" placeholder={l('Поиск...', 'Іздеу...', 'Search...')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" />
                </div>
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  <button onClick={() => { setSelectedPlatforms([]); setShowUnreadOnly(false); }} className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-all ${selectedPlatforms.length === 0 && !showUnreadOnly ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-400'}`}>{l('Все', 'Бәрі', 'All')} {chats.length}</button>
                  <button onClick={() => { setSelectedPlatforms([]); setShowUnreadOnly(true); }} className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-all ${showUnreadOnly ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-400'}`}>{l('Новые', 'Жаңа', 'New')} {chats.filter(c => c.unreadCount).length}</button>
                  {(['whatsapp', 'telegram', 'instagram'] as Chat['platform'][]).map(p => (
                    <button key={p} onClick={() => togglePlatform(p)} className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap flex items-center gap-1 transition-all ${selectedPlatforms.includes(p) ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-400'}`}>{platformDot(p)} {platformName(p)?.slice(0, 2)}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <MessageCircle className="w-10 h-10 text-gray-200 mb-3" />
                    <p className="text-sm text-slate-700 mb-1">
                      {chats.length === 0
                        ? l('Подключите мессенджеры', 'Мессенджерлерді қосыңыз', 'Connect messengers')
                        : l('Чатов не найдено', 'Чаттар табылмады', 'No chats found')}
                    </p>
                    {chats.length === 0 ? (
                      <>
                        <p className="text-[11px] text-slate-400 max-w-[240px] leading-relaxed mb-3">
                          {l(
                            'WhatsApp, Instagram, Telegram — заявки клиентов из всех каналов в одной ленте.',
                            'WhatsApp, Instagram, Telegram — клиенттердің барлық арналары бір лентада.',
                            'WhatsApp, Instagram, Telegram — leads from all channels in one feed.',
                          )}
                        </p>
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'settings', tab: 'integrations' } }))}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[11px] hover:bg-emerald-700 ring-1 ring-white/10 transition-all"
                        >
                          {l('Открыть Интеграции', 'Интеграциялар', 'Open Integrations')}
                        </button>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-400">{l('Сбросьте фильтры', 'Сүзгілерді тастаңыз', 'Reset filters')}</p>
                    )}
                  </div>
                ) : filteredChats.map(chat => (
                  <button key={chat.id} onClick={() => handleChatSelect(chat)} className={`w-full px-3 py-3 border-b border-white/60 hover:bg-white/30 transition-colors text-left ${selectedChat?.id === chat.id ? 'bg-gray-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-slate-500 text-sm">{chat.name.charAt(0)}</div>
                        {chat.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm text-gray-900 truncate pr-2">{chat.name}</span>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{chat.time}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-400 truncate flex-1">{chat.lastMessage}</p>
                          {chat.unreadCount && chat.unreadCount > 0 && (
                            <span className="ml-2 min-w-[18px] h-[18px] bg-gray-900 rounded-full flex items-center justify-center text-[10px] text-white px-1">{chat.unreadCount}</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1">{platformDot(chat.platform)}<span className="text-[10px] text-slate-300">{platformName(chat.platform)}</span></div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Area */}
            {selectedChat ? (
              <div className="flex-1 flex flex-col bg-white">
                <div className="px-4 py-3 border-b border-white/60 flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden p-1.5 hover:bg-white/70 rounded-lg">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-slate-500 text-sm">{selectedChat.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{selectedChat.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">{platformDot(selectedChat.platform)}<span className="text-[10px] text-slate-400">{platformName(selectedChat.platform)}</span>{selectedChat.online && <span className="text-[10px] text-green-500">• online</span>}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedChat.orderId && <button onClick={() => toast(`Заказ #${selectedChat.orderId}`)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-white/70 text-xs"><ShoppingCart className="w-3.5 h-3.5" />#{selectedChat.orderId}</button>}
                    <button onClick={startCall} className="p-2 hover:bg-white/50 rounded-lg"><Phone className="w-4 h-4 text-slate-400" /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
                  <div className="space-y-2.5 max-w-3xl mx-auto">
                    {selectedChat.orderId && (
                      <div className="flex justify-center my-3"><span className="bg-white px-3 py-1 rounded-full text-[10px] text-slate-400 border border-gray-100">{l('Привязан к заказу', 'Тапсырысқа байланысты', 'Linked to order')} #{selectedChat.orderId}</span></div>
                    )}
                    <div className="flex justify-center my-4"><span className="bg-white px-3 py-1 rounded-full text-[10px] text-slate-400 border border-gray-100">{l('Сегодня', 'Бүгін', 'Today')}</span></div>
                    {messages.map(m => (
                      <div key={m.id} className={`flex ${m.isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[75%] md:max-w-md">
                          <TextMessage message={m} language={language} />
                          <ImageMessage message={m} language={language} />
                          <FileMessage message={m} language={language} />
                          <VoiceMessage message={m} language={language} playingVoiceId={playingVoiceId} onToggleVoicePlay={toggleVoicePlay} />
                          <CallMessage message={m} language={language} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 border-t border-white/60 bg-white flex-shrink-0">
                  {isRecording && (
                    <div className="mb-2 max-w-3xl mx-auto bg-red-50 rounded-xl px-4 py-2.5 flex items-center gap-3">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-xs text-red-600 flex-1">{l('Запись', 'Жазу', 'Recording')} {formatDuration(recordingDuration)}</span>
                      <button onClick={sendVoiceMessage} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs">{l('Отправить', 'Жіберу', 'Send')}</button>
                      <button onClick={cancelRecording} className="px-3 py-1 bg-white text-gray-600 rounded-lg text-xs border border-gray-200">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
                    </div>
                  )}
                  <div className="flex items-end gap-2 max-w-3xl mx-auto">
                    <div className="relative">
                      <button onClick={() => setShowAttachmentMenu(!showAttachmentMenu)} className="p-2 hover:bg-white/50 rounded-lg"><Paperclip className="w-4 h-4 text-slate-400" /></button>
                      {showAttachmentMenu && (
                        <div className="absolute bottom-full left-0 mb-1 bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 min-w-[160px] z-10">
                          {[{ type: 'document' as const, icon: FileText, color: 'text-blue-500', label: l('Документ', 'Құжат', 'Document') }, { type: 'image' as const, icon: ImageIcon, color: 'text-green-500', label: l('Фото', 'Фото', 'Photo') }, { type: 'video' as const, icon: Film, color: 'text-purple-500', label: l('Видео', 'Видео', 'Video') }].map(a => (
                            <button key={a.type} onClick={() => handleSendFile(a.type)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/50 rounded-lg text-xs"><a.icon className={`w-4 h-4 ${a.color}`} />{a.label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <textarea
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder={canWrite ? l('Сообщение...', 'Хабарлама...', 'Message...') : l('Только просмотр', 'Тек көру', 'View only')}
                      readOnly={!canWrite}
                      rows={1}
                      className="flex-1 px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all resize-none"
                      style={{ minHeight: '38px', maxHeight: '100px' }}
                    />
                    <button onClick={isRecording ? stopRecording : startRecording} disabled={!canWrite} className={`p-2 rounded-lg transition-all ${isRecording ? 'bg-red-500 text-white' : 'hover:bg-white/50 text-gray-400'} disabled:opacity-40 disabled:cursor-not-allowed`}>{isRecording ? <StopCircle className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
                    <button onClick={handleSendMessage} disabled={!newMessage.trim() || !canWrite} className={`p-2 rounded-lg transition-all ${newMessage.trim() && canWrite ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-300'}`}><Send className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 hidden md:flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><MessageCircle className="w-6 h-6 text-slate-300" /></div>
                  <div className="text-sm text-slate-400">{l('Выберите чат', 'Чат таңдаңыз', 'Select a chat')}</div>
                  <div className="text-xs text-slate-300 mt-1">
                    {pendingShare
                      ? l('Откройте чат — концепт автоматически прикрепится', 'Чатты ашыңыз — концепт автоматты қосылады', 'Open a chat — the concept will attach automatically')
                      : l('Выберите диалог слева', 'Сол жақтан таңдаңыз', 'Pick a conversation')}
                  </div>
                  {pendingShare && (
                    <img src={pendingShare.imageUrl} alt="" className="mt-4 mx-auto max-h-40 rounded-2xl ring-1 ring-white/60 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)]" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== AI AGENT TAB ===== */}
        {activeTab === 'ai-agent' && (
          <div className="h-full overflow-y-auto p-4 md:p-6">
            <div className="max-w-3xl mx-auto">
              {/* Sub-tabs */}
              <div className="flex gap-1.5 mb-6">
                {([
                  ['agent',     l('AI-агент', 'AI-агент', 'AI Agent')],
                  ['scenarios', l('Сценарии Instagram', 'Instagram сценарийлері', 'Instagram scenarios')],
                ] as [typeof aiAgentSubTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setAiAgentSubTab(id)} className={`px-4 py-2 rounded-xl text-xs transition-all ${aiAgentSubTab === id ? 'bg-gray-900 text-white' : 'bg-white/60 ring-1 ring-white/60 backdrop-blur-xl text-slate-400 hover:text-gray-600'}`}>{label}</button>
                ))}
              </div>

              {/* ── Sub-tab 1: AI-агент ── */}
              {aiAgentSubTab === 'agent' && (
                <div className="space-y-4">
                  {/* Header card */}
                  <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-900">{l('AI-агент Utir', 'AI-агент Utir', 'Utir AI Agent')}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${aiAgentEnabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className={`text-[11px] ${aiAgentEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                            {aiAgentEnabled ? l('Активен', 'Белсенді', 'Active') : l('Отключён', 'Өшірілген', 'Disabled')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">{l('Включить AI-агент', 'AI-агентті қосу', 'Enable AI Agent')}</span>
                      <Toggle value={aiAgentEnabled} onChange={() => canWrite && setAiAgentEnabled(!aiAgentEnabled)} />
                    </div>
                  </div>

                  {/* Channels */}
                  <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4">
                    <div className="text-[11px] text-slate-400 mb-3">{l('Каналы работы', 'Жұмыс арналары', 'Active channels')}</div>
                    <div className="flex gap-4">
                      {([['whatsapp', 'WhatsApp', 'bg-green-50 text-green-700'], ['instagram', 'Instagram', 'bg-pink-50 text-pink-700'], ['telegram', 'Telegram', 'bg-blue-50 text-blue-700']] as [keyof typeof aiChannels, string, string][]).map(([key, name, cls]) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={aiChannels[key]} onChange={e => setAiChannels({ ...aiChannels, [key]: e.target.checked })} className="w-3.5 h-3.5 rounded accent-gray-900" />
                          <span className={`px-2 py-0.5 rounded text-[11px] ${cls}`}>{name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Tone */}
                  <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4">
                    <div className="text-[11px] text-slate-400 mb-3">{l('Тон общения', 'Сөйлесу тоны', 'Conversation tone')}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'professional' as const, icon: Briefcase, label: l('Профессиональный', 'Кәсіби', 'Professional') },
                        { id: 'friendly'     as const, icon: Smile,     label: l('Дружелюбный',     'Достасу',  'Friendly') },
                        { id: 'casual'       as const, icon: Hand,      label: l('Неформальный',    'Бейресми', 'Casual') },
                      ].map(t => {
                        const ToneIcon = t.icon;
                        return (
                        <button key={t.id} onClick={() => canWrite && setAiTone(t.id)} className={`p-3 rounded-xl border text-center transition-all ${aiTone === t.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100'} ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}>
                          <ToneIcon className="w-4 h-4 mx-auto mb-1 text-slate-500" strokeWidth={1.5} />
                          <div className="text-[10px] text-gray-600">{t.label}</div>
                        </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Knowledge base */}
                  <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4">
                    <div className="text-[11px] text-slate-400 mb-3">{l('База знаний', 'Білім базасы', 'Knowledge base')}</div>
                    <button
                      disabled={!canWrite}
                      className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-200 rounded-xl text-xs text-slate-400 hover:border-gray-300 mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />{l('Загрузить файлы (PDF, DOCX, TXT)', 'Файлдарды жүктеу (PDF, DOCX, TXT)', 'Upload files (PDF, DOCX, TXT)')}
                    </button>
                    <div className="space-y-1.5 mb-3">
                      {aiKnowledgeFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                          <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          <span className="text-xs text-slate-700 flex-1">{f}</span>
                          <button className="p-0.5 hover:bg-gray-200 rounded"><X className="w-3 h-3 text-slate-400" /></button>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 mb-1">{l('Дополнительные инструкции', 'Қосымша нұсқаулықтар', 'Additional instructions')}</div>
                      <textarea
                        value={aiInstructions}
                        onChange={e => canWrite && setAiInstructions(e.target.value)}
                        readOnly={!canWrite}
                        rows={3}
                        className="w-full px-3 py-2.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all resize-none"
                      />
                      <div className="text-[10px] text-slate-400 mt-1">
                        {l(`Подсказки берутся из ниши «${niche.name.ru}» — можно дописать свои правила.`,
                           `«${niche.name.kz}» салаға бейімделген нұсқаулықтар — өзіңіздікін қосуға болады.`,
                           `Hints come from your niche "${niche.name.eng}" — feel free to add your own.`)}
                      </div>
                    </div>
                  </div>

                  {/* Transfer conditions */}
                  <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4">
                    <div className="text-[11px] text-slate-400 mb-3">{l('Передача менеджеру', 'Менеджерге беру', 'Hand off to manager')}</div>
                    <div className="space-y-1">
                      {([
                        ['measurement', l('Клиент просит замер',         'Клиент өлшеу сұрайды',     'Client asks for measurement')],
                        ['discount',    l('Клиент спрашивает скидку больше 10%', 'Клиент 10%-дан жоғары жеңілдік сұрайды', 'Client asks for >10% discount')],
                        ['unknown',     l('AI не знает ответ',             'AI жауап білмейді',         'AI does not know the answer')],
                        ['longChat',    l('Клиент пишет более 5 минут',    'Клиент 5 минуттан көп жазады','Client typing for over 5 min')],
                      ] as [keyof typeof aiTransferConditions, string][]).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-white/50">
                          <input type="checkbox" disabled={!canWrite} checked={aiTransferConditions[key]} onChange={e => canWrite && setAiTransferConditions({ ...aiTransferConditions, [key]: e.target.checked })} className="w-3.5 h-3.5 rounded accent-gray-900" />
                          <span className="text-xs text-slate-700">{label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 p-2.5 bg-gray-50 rounded-xl text-[10px] text-slate-400">
                      {l('При срабатывании условия диалог переходит в раздел «Диалоги» с меткой', 'Шарт іске қосылса диалог «Диалогтар» бөліміне көшеді', 'When the condition is met, the dialog moves to "Dialogs" with a label')}
                      {' '}<span className="text-orange-500">{l('Требует внимания', 'Назар аударыңыз', 'Needs attention')}</span>
                    </div>
                  </div>

                  {/* Stats — labels niche-aware. "Записано на замер" is
                      furniture/windows speak; for blinds/ceilings/floors
                      it's still "measurement" in spirit. We just call it
                      "Бронирований/Bookings" so it reads cleanly everywhere. */}
                  <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4">
                    <div className="text-[11px] text-slate-400 mb-3">{l('Статистика за 30 дней', '30 күнге статистика', '30-day stats')}</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: l('Диалогов обработано', 'Өңделген диалогтар',  'Dialogs handled'),    value: '0' },
                        { label: l('Передано менеджеру',  'Менеджерге берілді',   'Passed to manager'),  value: '0' },
                        { label: l('Заявок на замер',      'Өлшеуге өтінімдер',    'Measurement requests'), value: '0' },
                        { label: l('Конверсия',            'Конверсия',            'Conversion'),           value: '—' },
                      ].map((s, i) => (
                        <div key={i} className="bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3 text-center">
                          <div className="text-lg text-gray-900">{s.value}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2 text-center">
                      {l('Реальные цифры появятся после подключения каналов в Настройках.',
                         'Арналар қосылғаннан кейін нақты сандар шығады.',
                         'Real numbers appear once channels are connected in Settings.')}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Sub-tab 2: Сценарии Instagram ── */}
              {aiAgentSubTab === 'scenarios' && (
                <div>
                  <p className="text-xs text-slate-400 mb-4">
                    {l('Автоматические сценарии для Instagram. Нажмите на карточку для настройки.',
                       'Instagram үшін автоматты сценарийлер.',
                       'Automatic scenarios for Instagram. Click a card to configure.')}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {scenariosData.map(sc => {
                      const isActive = activeScenarios[sc.id];
                      // Resolve title/desc for the current language and
                      // substitute the niche-keyword placeholder.
                      const title = (sc.titleKey[language] || sc.titleKey.ru).replace('{NICHE_KEYWORD}', nicheKeyword);
                      const desc  = (sc.descKey[language]  || sc.descKey.ru ).replace('{NICHE_KEYWORD}', nicheKeyword);
                      return (
                        <div
                          key={sc.id}
                          onClick={() => setScenarioModal(sc.id)}
                          className={`relative bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-sm transition-all ${isActive ? 'border-green-200' : 'border-gray-100'}`}
                        >
                          {isActive && <span className="absolute top-3 right-3 w-2 h-2 bg-green-500 rounded-full" />}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${isActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <sc.icon className={`w-4 h-4 ${isActive ? 'text-green-600' : 'text-gray-400'}`} />
                          </div>
                          <div className="text-sm text-slate-900 mb-1">{title}</div>
                          <div className="text-[11px] text-slate-400 mb-3">{desc}</div>
                          <button
                            onClick={e => { e.stopPropagation(); if (canWrite) setActiveScenarios(prev => ({ ...prev, [sc.id]: !prev[sc.id] })); }}
                            disabled={!canWrite}
                            className={`px-3 py-1.5 rounded-lg text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-slate-500 border border-gray-100'}`}
                          >
                            {isActive
                              ? l('✓ Включён', '✓ Қосулы', '✓ On')
                              : l('Включить', 'Қосу', 'Enable')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== AUTOMATION TAB ===== */}
        {activeTab === 'automation' && (
          <div className="h-full overflow-y-auto flex items-center justify-center p-6">
            <div className="text-center max-w-md">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Zap className="w-6 h-6 text-slate-400" /></div>
              <div className="text-sm text-slate-900 mb-1">{l('Автоматизация', 'Автоматтандыру', 'Automation')}</div>
              <p className="text-xs text-slate-400 mb-6">{l('Триггеры, сценарии и автоматические действия', 'Триггерлер, сценарийлер және автоматты әрекеттер', 'Triggers, scenarios and automatic actions')}</p>
              <div className="grid grid-cols-3 gap-3">
                {[{ icon: Zap, label: l('Триггеры', 'Триггерлер', 'Triggers'), hint: l('Автоматические события', 'Автоматты оқиғалар', 'Auto events') },
                  { icon: Settings, label: l('Сценарии', 'Сценарийлер', 'Scenarios'), hint: l('Цепочки действий', 'Әрекеттер тізбегі', 'Action chains') },
                  { icon: TrendingUp, label: l('Аналитика', 'Аналитика', 'Analytics'), hint: l('Отслеживание', 'Бақылау', 'Tracking') },
                ].map((c, i) => <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4"><c.icon className="w-5 h-5 text-slate-400 mb-2" /><div className="text-xs text-slate-900 mb-0.5">{c.label}</div><div className="text-[10px] text-slate-400">{c.hint}</div></div>)}
              </div>
              <button className="mt-6 px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all">{l('Настроить', 'Баптау', 'Configure')}</button>
            </div>
          </div>
        )}
      </div>

      {/* ===== SCENARIO MODAL ===== */}
      {scenarioModal && currentScenario && (() => {
        const title = (currentScenario.titleKey[language] || currentScenario.titleKey.ru).replace('{NICHE_KEYWORD}', nicheKeyword);
        return (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setScenarioModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                  <currentScenario.icon className="w-4 h-4 text-slate-500" />
                </div>
                <span className="text-sm text-gray-900">{title}</span>
              </div>
              <button onClick={() => setScenarioModal(null)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">{l('Текст сообщения', 'Хабарлама мәтіні', 'Message text')}</label>
                <textarea
                  value={scenarioTexts[scenarioModal] || ''}
                  onChange={e => canWrite && setScenarioTexts(prev => ({ ...prev, [scenarioModal]: e.target.value }))}
                  readOnly={!canWrite}
                  rows={4}
                  className="w-full px-3 py-2.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-2">{l('Статус сценария', 'Сценарий күйі', 'Scenario status')}</label>
                <button
                  onClick={() => canWrite && setActiveScenarios(prev => ({ ...prev, [scenarioModal]: !prev[scenarioModal] }))}
                  disabled={!canWrite}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border transition-all disabled:opacity-50 ${activeScenarios[scenarioModal] ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-slate-500 border-gray-100'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeScenarios[scenarioModal] ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {activeScenarios[scenarioModal]
                    ? l('Сценарий включён', 'Сценарий қосулы', 'Scenario enabled')
                    : l('Сценарий выключен', 'Сценарий өшірулі', 'Scenario disabled')}
                </button>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => setScenarioModal(null)} className="flex-1 px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors">
                {l('Отмена', 'Бас тарту', 'Cancel')}
              </button>
              <button onClick={() => setScenarioModal(null)} disabled={!canWrite} className="flex-1 px-3 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {l('Сохранить', 'Сақтау', 'Save')}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Call Modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-72 p-6 text-center shadow-xl">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Phone className={`w-6 h-6 ${isInCall ? 'text-green-500' : 'text-gray-400'}`} /></div>
            <div className="text-sm text-slate-900 mb-1">{selectedChat?.name}</div>
            <div className="text-xs text-slate-400 mb-4">{isInCall ? formatDuration(callDuration) : l('Вызов...', 'Қоңырау...', 'Calling...')}</div>
            <button onClick={endCall} className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto hover:bg-red-600"><Phone className="w-5 h-5 text-white rotate-[135deg]" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
