import { useState } from 'react';
import { Search, Send, Paperclip, MessageCircle, Bot, Check, CheckCheck, Plus, X, Play, Pause, Edit2, Trash2, Copy, Users, TrendingUp, Calendar, Clock, Zap, MessageSquare, Settings, BarChart3, Eye, ArrowRight, Circle, ShoppingCart, ExternalLink, Phone, Mic, FileText, Image as ImageIcon, Film, StopCircle, Sparkles, Key, Heart, Hand, AlarmClock } from 'lucide-react';
import { translations } from '../utils/translations';
import { TextMessage, ImageMessage, FileMessage, VoiceMessage, CallMessage } from './ChatMessageTypes';
import { PlatformIcon } from './PlatformLogos';

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

const scenariosData = [
  { id: 'comment_dm', icon: MessageCircle, title: 'Комментарий → DM с прайсом', desc: 'Когда кто-то комментирует пост — автоматически отправляем прайс в Direct' },
  { id: 'story_dm', icon: Heart, title: 'Реакция на сторис → DM с кейсами', desc: 'Когда подписчик реагирует на сторис — отправляем подборку наших работ' },
  { id: 'keyword_measure', icon: Key, title: 'Ключевое слово → запись на замер', desc: 'Когда в сообщении есть слова «замер», «цена», «кухня» — предлагаем записаться' },
  { id: 'new_follower', icon: Hand, title: 'Новый подписчик → приветствие', desc: 'Здороваемся с новыми подписчиками и отправляем подборку п��пулярных моделей' },
  { id: 'abandoned', icon: AlarmClock, title: 'Брошенный диалог → напоминание', desc: 'Если клиент не ответил 24 часа — отправляем дружелюбное напоминание' },
];

export function Chats({ language }: ChatsProps) {
  const [activeTab, setActiveTab] = useState<'chats' | 'ai-agent' | 'automation'>('chats');
  const [aiAgentSubTab, setAiAgentSubTab] = useState<'agent' | 'scenarios'>('agent');
  const [aiAgentEnabled, setAiAgentEnabled] = useState(true);
  const [aiChannels, setAiChannels] = useState({ whatsapp: true, instagram: true, telegram: false });
  const [aiTone, setAiTone] = useState<'professional' | 'friendly' | 'casual'>('friendly');
  const [aiInstructions, setAiInstructions] = useState('Всегда уточняй размеры комнаты. При вопросе о цене — отправляй прайс. Если клиент готов к замеру — передавай менеджеру.');
  const [aiKnowledgeFiles] = useState(['Прайс-2026.pdf', 'Каталог кухонь.pdf']);
  const [aiTransferConditions, setAiTransferConditions] = useState({ measurement: true, discount: true, unknown: true, longChat: false });
  const [activeScenarios, setActiveScenarios] = useState<Record<string, boolean>>({ comment_dm: true, story_dm: false, keyword_measure: true, new_follower: false, abandoned: false });
  const [scenarioModal, setScenarioModal] = useState<string | null>(null);
  const [scenarioTexts, setScenarioTexts] = useState<Record<string, string>>({
    comment_dm: 'Привет! 👋 Спасибо за комментарий. Отправляем вам наш актуальный прайс. Если есть вопросы — пишите!',
    story_dm: 'Привет! Рады, что вам понравилось 😊 Вот наши лучшие реализованные проекты:',
    keyword_measure: 'Здравствуйте! Я вижу, вы интересуетесь замером. Хотите записаться на бесплатный замер и консультацию?',
    new_follower: 'Добро пожаловать! 🏠 Мы производим мебель под заказ. Вот наши популярные модели:',
    abandoned: 'Здравствуйте! Мы заметили, что наш разговор прервался. Можем ли мы помочь вам с выбором мебели? 😊',
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

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const platformDot = (p: Chat['platform']) => <PlatformIcon platform={p} size="sm" />;
  const platformName = (p: Chat['platform']) => ({ whatsapp: 'WhatsApp', instagram: 'Instagram', telegram: 'Telegram', tiktok: 'TikTok' }[p]);
  const platformBadge = (p: Chat['platform']) => ({ whatsapp: 'bg-green-50 text-green-700 border-green-200', instagram: 'bg-pink-50 text-pink-700 border-pink-200', telegram: 'bg-blue-50 text-blue-700 border-blue-200', tiktok: 'bg-gray-50 text-gray-700 border-gray-200' }[p]);

  const handleChatSelect = (chat: Chat) => { setSelectedChat(chat); setMessages(chat.messages); };
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

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-3 flex-shrink-0">
        <div className="text-sm text-gray-900">{l('Омниканальные чаты', 'Омниканалды чаттар', 'Omnichannel Chats')}</div>
        <div className="flex gap-1">
          {tabItems.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${activeTab === t.id ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
              <t.icon className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* ===== CHATS TAB ===== */}
        {activeTab === 'chats' && (
          <div className="flex h-full">
            {/* Sidebar */}
            <div className={`w-full md:w-80 lg:w-96 border-r border-gray-100 bg-white flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-3 space-y-2 border-b border-gray-50 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                  <input type="text" placeholder={l('Поиск...', 'Іздеу...', 'Search...')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
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
                    <MessageCircle className="w-10 h-10 text-gray-200 mb-2" />
                    <p className="text-xs text-gray-400">{l('Чатов не найдено', 'Чаттар табылмады', 'No chats found')}</p>
                  </div>
                ) : filteredChats.map(chat => (
                  <button key={chat.id} onClick={() => handleChatSelect(chat)} className={`w-full px-3 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors text-left ${selectedChat?.id === chat.id ? 'bg-gray-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 text-sm">{chat.name.charAt(0)}</div>
                        {chat.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm text-gray-900 truncate pr-2">{chat.name}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{chat.time}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-400 truncate flex-1">{chat.lastMessage}</p>
                          {chat.unreadCount && chat.unreadCount > 0 && (
                            <span className="ml-2 min-w-[18px] h-[18px] bg-gray-900 rounded-full flex items-center justify-center text-[10px] text-white px-1">{chat.unreadCount}</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1">{platformDot(chat.platform)}<span className="text-[10px] text-gray-300">{platformName(chat.platform)}</span></div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Area */}
            {selectedChat ? (
              <div className="flex-1 flex flex-col bg-white">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden p-1.5 hover:bg-gray-100 rounded-lg">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 text-sm">{selectedChat.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{selectedChat.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">{platformDot(selectedChat.platform)}<span className="text-[10px] text-gray-400">{platformName(selectedChat.platform)}</span>{selectedChat.online && <span className="text-[10px] text-green-500">• online</span>}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedChat.orderId && <button onClick={() => alert(`Заказ #${selectedChat.orderId}`)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 text-xs"><ShoppingCart className="w-3.5 h-3.5" />#{selectedChat.orderId}</button>}
                    <button onClick={startCall} className="p-2 hover:bg-gray-50 rounded-lg"><Phone className="w-4 h-4 text-gray-400" /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
                  <div className="space-y-2.5 max-w-3xl mx-auto">
                    {selectedChat.orderId && (
                      <div className="flex justify-center my-3"><span className="bg-white px-3 py-1 rounded-full text-[10px] text-gray-400 border border-gray-100">{l('Привязан к заказу', 'Тапсырысқа байланысты', 'Linked to order')} #{selectedChat.orderId}</span></div>
                    )}
                    <div className="flex justify-center my-4"><span className="bg-white px-3 py-1 rounded-full text-[10px] text-gray-400 border border-gray-100">{l('Сегодня', 'Бүгін', 'Today')}</span></div>
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

                <div className="p-3 border-t border-gray-50 bg-white flex-shrink-0">
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
                      <button onClick={() => setShowAttachmentMenu(!showAttachmentMenu)} className="p-2 hover:bg-gray-50 rounded-lg"><Paperclip className="w-4 h-4 text-gray-400" /></button>
                      {showAttachmentMenu && (
                        <div className="absolute bottom-full left-0 mb-1 bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 min-w-[160px] z-10">
                          {[{ type: 'document' as const, icon: FileText, color: 'text-blue-500', label: l('Документ', 'Құжат', 'Document') }, { type: 'image' as const, icon: ImageIcon, color: 'text-green-500', label: l('Фото', 'Фото', 'Photo') }, { type: 'video' as const, icon: Film, color: 'text-purple-500', label: l('Видео', 'Видео', 'Video') }].map(a => (
                            <button key={a.type} onClick={() => handleSendFile(a.type)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg text-xs"><a.icon className={`w-4 h-4 ${a.color}`} />{a.label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} placeholder={l('Сообщение...', 'Хабарлама...', 'Message...')} rows={1} className="flex-1 px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" style={{ minHeight: '38px', maxHeight: '100px' }} />
                    <button onClick={isRecording ? stopRecording : startRecording} className={`p-2 rounded-lg transition-all ${isRecording ? 'bg-red-500 text-white' : 'hover:bg-gray-50 text-gray-400'}`}>{isRecording ? <StopCircle className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
                    <button onClick={handleSendMessage} disabled={!newMessage.trim()} className={`p-2 rounded-lg transition-all ${newMessage.trim() ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-300'}`}><Send className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 hidden md:flex items-center justify-center">
                <div className="text-center">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><MessageCircle className="w-6 h-6 text-gray-300" /></div>
                  <div className="text-sm text-gray-400">{l('Выберите чат', 'Чат таңдаңыз', 'Select a chat')}</div>
                  <div className="text-xs text-gray-300 mt-1">{l('Выберите диалог слева', 'Сол жақтан таңдаңыз', 'Pick a conversation')}</div>
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
                {([['agent', 'AI-агент'], ['scenarios', 'Сценарии Instagram']] as [typeof aiAgentSubTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setAiAgentSubTab(id)} className={`px-4 py-2 rounded-xl text-xs transition-all ${aiAgentSubTab === id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-100 text-gray-400 hover:text-gray-600'}`}>{label}</button>
                ))}
              </div>

              {/* ── Sub-tab 1: AI-агент ── */}
              {aiAgentSubTab === 'agent' && (
                <div className="space-y-4">
                  {/* Header card */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-900">AI-агент Utir</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${aiAgentEnabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className={`text-[11px] ${aiAgentEnabled ? 'text-green-600' : 'text-gray-400'}`}>{aiAgentEnabled ? 'Активен' : 'Отключён'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">Включить AI-агент</span>
                      <Toggle value={aiAgentEnabled} onChange={() => setAiAgentEnabled(!aiAgentEnabled)} />
                    </div>
                  </div>

                  {/* Channels */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="text-[11px] text-gray-400 mb-3">Каналы работы</div>
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
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="text-[11px] text-gray-400 mb-3">Тон общения</div>
                    <div className="grid grid-cols-3 gap-2">
                      {[{ id: 'professional' as const, emoji: '🎩', label: 'Профессиональный' }, { id: 'friendly' as const, emoji: '😊', label: 'Дружелюбный' }, { id: 'casual' as const, emoji: '✌️', label: 'Неформальный' }].map(t => (
                        <button key={t.id} onClick={() => setAiTone(t.id)} className={`p-3 rounded-xl border text-center transition-all ${aiTone === t.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100'}`}>
                          <div className="text-lg mb-1">{t.emoji}</div>
                          <div className="text-[10px] text-gray-600">{t.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Knowledge base */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="text-[11px] text-gray-400 mb-3">База знаний</div>
                    <button className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-gray-300 mb-3">
                      <Plus className="w-3.5 h-3.5" />Загрузить файлы (PDF, DOCX, TXT)
                    </button>
                    <div className="space-y-1.5 mb-3">
                      {aiKnowledgeFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                          <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          <span className="text-xs text-gray-700 flex-1">{f}</span>
                          <button className="p-0.5 hover:bg-gray-200 rounded"><X className="w-3 h-3 text-gray-400" /></button>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 mb-1">Дополнительные инструкции</div>
                      <textarea value={aiInstructions} onChange={e => setAiInstructions(e.target.value)} rows={3} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" />
                      <div className="text-[10px] text-gray-400 mt-1">Например: Всегда уточняй размеры комнаты. При вопросе о цене — отправляй прайс. Если клиент готов к замеру — передавай менеджеру.</div>
                    </div>
                  </div>

                  {/* Transfer conditions */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="text-[11px] text-gray-400 mb-3">Передача менеджеру</div>
                    <div className="space-y-1">
                      {([['measurement', 'Клиент просит замер'], ['discount', 'Клиент спрашивает скидку больше 10%'], ['unknown', 'AI не знает ответ'], ['longChat', 'Клиент пишет более 5 минут']] as [keyof typeof aiTransferConditions, string][]).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-gray-50">
                          <input type="checkbox" checked={aiTransferConditions[key]} onChange={e => setAiTransferConditions({ ...aiTransferConditions, [key]: e.target.checked })} className="w-3.5 h-3.5 rounded accent-gray-900" />
                          <span className="text-xs text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 p-2.5 bg-gray-50 rounded-xl text-[10px] text-gray-400">При срабатывании условия диалог переходит в раздел «Диалоги» с меткой <span className="text-orange-500">Требует внимания</span></div>
                  </div>

                  {/* Stats */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="text-[11px] text-gray-400 mb-3">Статистика за 30 дней</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[{ label: 'Диалогов обработано', value: '1 247' }, { label: 'Передано менеджеру', value: '89' }, { label: 'Записано на замер', value: '156' }, { label: 'Конверсия', value: '12.5%' }].map((s, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
                          <div className="text-lg text-gray-900">{s.value}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Sub-tab 2: Сценарии Instagram ── */}
              {aiAgentSubTab === 'scenarios' && (
                <div>
                  <p className="text-xs text-gray-400 mb-4">Автоматические сценарии для Instagram. Нажмите на карточку для настройки.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {scenariosData.map(sc => {
                      const isActive = activeScenarios[sc.id];
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
                          <div className="text-sm text-gray-900 mb-1">{sc.title}</div>
                          <div className="text-[11px] text-gray-400 mb-3">{sc.desc}</div>
                          <button
                            onClick={e => { e.stopPropagation(); setActiveScenarios(prev => ({ ...prev, [sc.id]: !prev[sc.id] })); }}
                            className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}
                          >
                            {isActive ? '✓ Включён' : 'Включить'}
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
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Zap className="w-6 h-6 text-gray-400" /></div>
              <div className="text-sm text-gray-900 mb-1">{l('Автоматизация', 'Автоматтандыру', 'Automation')}</div>
              <p className="text-xs text-gray-400 mb-6">{l('Триггеры, сценарии и автоматические действия', 'Триггерлер, сценарийлер және автоматты әрекеттер', 'Triggers, scenarios and automatic actions')}</p>
              <div className="grid grid-cols-3 gap-3">
                {[{ icon: Zap, label: l('Триггеры', 'Триггерлер', 'Triggers'), hint: l('Автоматические события', 'Автоматты оқиғалар', 'Auto events') },
                  { icon: Settings, label: l('Сценарии', 'Сценарийлер', 'Scenarios'), hint: l('Цепочки действий', 'Әрекеттер тізбегі', 'Action chains') },
                  { icon: TrendingUp, label: l('Аналитика', 'Аналитика', 'Analytics'), hint: l('Отслеживание', 'Бақылау', 'Tracking') },
                ].map((c, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4"><c.icon className="w-5 h-5 text-gray-400 mb-2" /><div className="text-xs text-gray-900 mb-0.5">{c.label}</div><div className="text-[10px] text-gray-400">{c.hint}</div></div>)}
              </div>
              <button className="mt-6 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Настроить', 'Баптау', 'Configure')}</button>
            </div>
          </div>
        )}
      </div>

      {/* ===== SCENARIO MODAL ===== */}
      {scenarioModal && currentScenario && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setScenarioModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                  <currentScenario.icon className="w-4 h-4 text-gray-500" />
                </div>
                <span className="text-sm text-gray-900">{currentScenario.title}</span>
              </div>
              <button onClick={() => setScenarioModal(null)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Текст сообщения</label>
                <textarea
                  value={scenarioTexts[scenarioModal] || ''}
                  onChange={e => setScenarioTexts(prev => ({ ...prev, [scenarioModal]: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-2">Статус сценария</label>
                <button
                  onClick={() => setActiveScenarios(prev => ({ ...prev, [scenarioModal]: !prev[scenarioModal] }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border transition-all ${activeScenarios[scenarioModal] ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-100'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeScenarios[scenarioModal] ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {activeScenarios[scenarioModal] ? 'Сценарий включён' : 'Сценарий выключен'}
                </button>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => setScenarioModal(null)} className="flex-1 px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">Отмена</button>
              <button onClick={() => setScenarioModal(null)} className="flex-1 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Call Modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-72 p-6 text-center shadow-xl">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Phone className={`w-6 h-6 ${isInCall ? 'text-green-500' : 'text-gray-400'}`} /></div>
            <div className="text-sm text-gray-900 mb-1">{selectedChat?.name}</div>
            <div className="text-xs text-gray-400 mb-4">{isInCall ? formatDuration(callDuration) : l('Вызов...', 'Қоңырау...', 'Calling...')}</div>
            <button onClick={endCall} className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto hover:bg-red-600"><Phone className="w-5 h-5 text-white rotate-[135deg]" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
