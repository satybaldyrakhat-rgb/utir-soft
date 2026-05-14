import { useState } from 'react';
import { X, FileText, Image as ImageIcon, Check, RefreshCw, Banknote, CreditCard, QrCode, Wallet, Building2, Calendar as CalendarIcon, MessageCircle, Send, Paperclip, Phone, Video, Mic, File, Film, StopCircle } from 'lucide-react';
import { translations as t } from '../utils/translations';
import { TextMessage, ImageMessage, FileMessage, VoiceMessage, CallMessage } from './ChatMessageTypes';

interface ClientOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: { id: string; customerName: string; product: string; amount: number; };
  language?: 'kz' | 'ru' | 'eng';
}

interface ChatMessage {
  id: string; text: string; time: string; isUser: boolean; read?: boolean;
  type?: 'text' | 'voice' | 'file' | 'image' | 'video' | 'call';
  fileUrl?: string; fileName?: string; fileSize?: string; duration?: string;
  callStatus?: 'missed' | 'incoming' | 'outgoing' | 'ended';
}

export function ClientOrderModal({ isOpen, onClose, deal, language = 'ru' }: ClientOrderModalProps) {
  const [activeTab, setActiveTab] = useState<'main' | 'progress' | 'chat'>('main');
  const [selectedMessenger, setSelectedMessenger] = useState<'whatsapp' | 'instagram' | 'telegram' | 'tiktok'>('whatsapp');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', text: 'Сәлеметсіз бе! Кухня гарнитурларыңыз бар ма?', time: '14:20', isUser: true },
    { id: '2', text: 'Сәлеметсіз бе! Иә, көп түрлері бар. Қандай өлшемде?', time: '14:22', isUser: false, read: true },
    { id: '3', text: '3 метр болса. Қанша тұрады?', time: '14:25', isUser: true },
    { id: '4', text: 'МДФ 450,000₸, массив ағаш 680,000₸ тен.', time: '14:28', isUser: false, read: true },
    { id: '5', text: '', time: '14:29', isUser: false, read: true, type: 'image', fileName: 'kitchen.jpg', fileUrl: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800' },
    { id: '6', text: 'МДФ керек. Доставка бар ма?', time: '14:30', isUser: true },
    { id: '7', text: '', time: '14:31', isUser: true, type: 'voice', duration: '0:12' },
    { id: '8', text: '', time: '14:36', isUser: true, type: 'file', fileName: 'Планировка.pdf', fileSize: '2.4 MB' },
    { id: '9', text: '', time: '14:42', isUser: false, read: true, type: 'call', callStatus: 'outgoing', duration: '3:24' },
    { id: '10', text: 'Рахмет, жақсы! Қашан келеді?', time: '15:42', isUser: true },
  ]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');

  const [phone, setPhone] = useState('+7 (701) 234-56-78');
  const [address, setAddress] = useState('г. Алматы, ул. Абая 123, кв. 45');
  const [source, setSource] = useState('Instagram');
  const [measurer, setMeasurer] = useState('Арман');
  const [designer, setDesigner] = useState('');
  const [furnitureType, setFurnitureType] = useState('Кухня');
  const [materials, setMaterials] = useState('ЛДСП Egger, фурнитура Blum');
  const [measurementDate] = useState('20 мар 2026');
  const [completionDate] = useState('20 апр 2026');
  const [installationDate] = useState('22 апр 2026');
  const [paymentMethods, setPaymentMethods] = useState({ cash: true, kaspiGold: true, kaspiQR: false, halykBank: false, cardTransfer: true, installment: false });

  if (!isOpen) return null;

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const handleSendChatMessage = () => {
    if (newChatMessage.trim()) {
      setChatMessages([...chatMessages, { id: String(Date.now()), text: newChatMessage, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, read: false }]);
      setNewChatMessage('');
    }
  };

  const addAttachment = (type: 'image' | 'file' | 'video') => {
    const data = { image: { type: 'image' as const, fileName: 'image.jpg', fileUrl: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=600' }, file: { type: 'file' as const, fileName: 'document.pdf', fileSize: '2.4 MB' }, video: { type: 'file' as const, fileName: 'video.mp4', fileSize: '15.8 MB' } }[type];
    setChatMessages([...chatMessages, { id: String(Date.now()), text: '', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, ...data }]);
    setShowAttachmentMenu(false);
  };

  const messengerConf = { whatsapp: { dot: 'bg-green-500', active: 'bg-green-50 border-green-200 text-green-700' }, instagram: { dot: 'bg-pink-500', active: 'bg-pink-50 border-pink-200 text-pink-700' }, telegram: { dot: 'bg-blue-500', active: 'bg-blue-50 border-blue-200 text-blue-700' }, tiktok: { dot: 'bg-gray-700', active: 'bg-gray-100 border-gray-300 text-gray-700' } };

  const payOpts = [
    { key: 'cash', icon: Banknote, color: 'text-green-600 bg-green-50', name: l('Наличные', 'Қолма-қол', 'Cash') },
    { key: 'kaspiGold', icon: Wallet, color: 'text-red-600 bg-red-50', name: 'Kaspi Gold' },
    { key: 'kaspiQR', icon: QrCode, color: 'text-red-600 bg-red-50', name: 'Kaspi QR' },
    { key: 'cardTransfer', icon: CreditCard, color: 'text-blue-600 bg-blue-50', name: l('Карта', 'Карта', 'Card') },
    { key: 'installment', icon: CalendarIcon, color: 'text-purple-600 bg-purple-50', name: l('Рассрочка 0-0-12', 'Бөліп төлеу', 'Installment') },
  ];

  const FieldInput = ({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Record<string, any>) => (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" {...props} />
    </div>
  );

  const FieldSelect = ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none">{children}</select>
    </div>
  );

  const tabs = [
    { id: 'main' as const, label: l('Информация', 'Ақпарат', 'Info') },
    { id: 'progress' as const, label: l('Прогресс', 'Прогресс', 'Progress') },
    { id: 'chat' as const, label: l('Чат', 'Чат', 'Chat'), badge: chatMessages.length },
  ];

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-sm text-gray-900">{deal.customerName}</div>
            <div className="text-[10px] text-gray-400">{l('Заказ', 'Тапсырыс', 'Order')} #{deal.id} · {deal.product} · {deal.amount.toLocaleString()} ₸</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
        </div>

        {/* 1C Sync */}
        <div className="px-5 py-2 bg-gray-50/50 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-gray-400">1C: DOC-2026-4025</span>
            <span className="flex items-center gap-0.5 text-green-500"><Check className="w-3 h-3" />{l('Синхронизировано', 'Синхрондалды', 'Synced')}</span>
          </div>
          <button className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"><RefreshCw className="w-3 h-3" />{l('Обновить', 'Жаңарту', 'Refresh')}</button>
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-gray-50 flex gap-1 flex-shrink-0">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-2.5 text-xs transition-all border-b-2 ${activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {tab.id === 'chat' && <MessageCircle className="w-3 h-3" />}
              {tab.label}
              {tab.badge != null && <span className="bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded-full">{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* MAIN TAB */}
          {activeTab === 'main' && (
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <FieldInput label={l('Телефон', 'Телефон', 'Phone')} value={phone} onChange={setPhone} />
                  <FieldInput label={l('Адрес', 'Мекенжай', 'Address')} value={address} onChange={setAddress} />
                  <FieldSelect label={l('Источник', 'Көзі', 'Source')} value={source} onChange={setSource}>
                    <option>Instagram</option><option>WhatsApp</option><option>Facebook</option><option>{l('Реклама', 'Жарнама', 'Ads')}</option><option>{l('Рекомендация', 'Ұсыныс', 'Referral')}</option>
                  </FieldSelect>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">{l('Материалы', 'Материалдар', 'Materials')}</label>
                    <textarea value={materials} onChange={e => setMaterials(e.target.value)} rows={2} className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" />
                  </div>
                </div>
                <div className="space-y-3">
                  <FieldSelect label={l('Замерщик', 'Өлшеуші', 'Measurer')} value={measurer} onChange={setMeasurer}>
                    <option>Арман</option><option>Нурлан</option><option>Ерлан</option>
                  </FieldSelect>
                  <FieldInput label={l('Дизайнер', 'Дизайнер', 'Designer')} value={designer} onChange={setDesigner} placeholder={l('Имя дизайнера', 'Дизайнер аты', 'Designer name')} />
                  <FieldSelect label={l('Тип мебели', 'Жиһаз түрі', 'Furniture Type')} value={furnitureType} onChange={setFurnitureType}>
                    <option>{l('Кухня', 'Ас үй', 'Kitchen')}</option><option>{l('Шкаф-купе', 'Шкаф', 'Wardrobe')}</option><option>{l('Гардеробная', 'Гардероб', 'Closet')}</option><option>{l('Офисная', 'Кеңсе', 'Office')}</option>
                  </FieldSelect>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-2">{l('Документы', 'Құжаттар', 'Documents')}</label>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs hover:bg-blue-100"><FileText className="w-3.5 h-3.5" />{l('Договор.pdf', 'Келісім.pdf', 'Contract.pdf')}</button>
                  <button className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-600 rounded-xl text-xs hover:bg-purple-100"><ImageIcon className="w-3.5 h-3.5" />{l('Эскиз.jpg', 'Эскиз.jpg', 'Sketch.jpg')}</button>
                </div>
              </div>
            </div>
          )}

          {/* PROGRESS TAB */}
          {activeTab === 'progress' && (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Timeline */}
              <div>
                <div className="text-xs text-gray-900 mb-3">{l('Сроки', 'Мерзімдер', 'Timeline')}</div>
                <div className="space-y-3">
                  {[{ label: l('Замер', 'Өлшем', 'Measure'), date: measurementDate, done: true }, { label: l('Готовность', 'Дайын', 'Completion'), date: completionDate, done: false }, { label: l('Установка', 'Орнату', 'Installation'), date: installationDate, done: false }].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${item.done ? 'bg-green-500' : 'bg-gray-200'}`}>
                        {item.done ? <Check className="w-3 h-3 text-white" /> : <span className="text-[9px] text-white">{i + 1}</span>}
                      </div>
                      <div className="flex-1"><div className="text-xs text-gray-900">{item.label}</div><div className="text-[10px] text-gray-400">{item.date}</div></div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] mb-1"><span className="text-gray-400">{l('Прогресс', 'Прогресс', 'Progress')}</span><span className="text-gray-900">65%</span></div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gray-900 rounded-full" style={{ width: '65%' }} /></div>
                </div>
              </div>

              {/* Payment */}
              <div>
                <div className="text-xs text-gray-900 mb-3">{l('Оплата', 'Төлем', 'Payment')}</div>
                <div className="space-y-1.5 mb-4">
                  {payOpts.map(opt => (
                    <label key={opt.key} className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                      <input type="checkbox" checked={(paymentMethods as any)[opt.key]} onChange={e => setPaymentMethods({ ...paymentMethods, [opt.key]: e.target.checked })} className="w-3.5 h-3.5 rounded accent-gray-900" />
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${opt.color}`}><opt.icon className="w-3.5 h-3.5" /></div>
                      <span className="text-xs text-gray-700">{opt.name}</span>
                    </label>
                  ))}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between text-[10px] mb-1"><span className="text-gray-400">{l('Оплачено', 'Төленді', 'Paid')}: 50%</span><span className="text-gray-900">600,000 / 1,200,000 ₸</span></div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: '50%' }} /></div>
                  <div className="mt-2 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" /><span className="text-[10px] text-orange-600">{l('Частично оплачено', 'Ішінара төленді', 'Partially paid')}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* CHAT TAB */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-[500px]">
              {/* Messenger selector */}
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
                <div className="flex gap-1">
                  {(['whatsapp', 'instagram', 'telegram', 'tiktok'] as const).map(p => (
                    <button key={p} onClick={() => setSelectedMessenger(p)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all ${selectedMessenger === p ? messengerConf[p].active : 'border-gray-100 text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${messengerConf[p].dot}`} />{p.charAt(0).toUpperCase() + p.slice(1, 2)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setCallType('voice'); setShowCallModal(true); }} className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"><Phone className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setCallType('video'); setShowCallModal(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Video className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30 space-y-2">
                <div className="flex justify-center my-2"><span className="bg-white px-3 py-1 rounded-full text-[9px] text-gray-400 border border-gray-100">{l('Сегодня', 'Бүгін', 'Today')}</span></div>
                {chatMessages.map(m => (
                  <div key={m.id} className={`flex ${m.isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%]">
                      <TextMessage message={m} language={language} />
                      <ImageMessage message={m} language={language} />
                      <FileMessage message={m} language={language} />
                      <VoiceMessage message={m} language={language} playingVoiceId={playingVoiceId} onToggleVoicePlay={id => setPlayingVoiceId(playingVoiceId === id ? null : id)} />
                      <CallMessage message={m} language={language} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="p-3 border-t border-gray-50 bg-white flex-shrink-0">
                {isRecordingVoice ? (
                  <div className="bg-red-50 rounded-xl px-4 py-2 flex items-center gap-3">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs text-red-600 flex-1">{l('Запись', 'Жазу', 'Recording')} {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                    <button onClick={() => { setIsRecordingVoice(false); setChatMessages([...chatMessages, { id: String(Date.now()), text: '', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, type: 'voice', duration: `${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60).toString().padStart(2, '0')}` }]); setRecordingDuration(0); }} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs">{l('Отправить', 'Жіберу', 'Send')}</button>
                    <button onClick={() => { setIsRecordingVoice(false); setRecordingDuration(0); }} className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <div className="relative">
                      <button onClick={() => setShowAttachmentMenu(!showAttachmentMenu)} className="p-2 hover:bg-gray-50 rounded-lg"><Paperclip className="w-4 h-4 text-gray-400" /></button>
                      {showAttachmentMenu && (
                        <div className="absolute bottom-full left-0 mb-1 bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 min-w-[140px] z-10">
                          {[{ type: 'image' as const, icon: ImageIcon, color: 'text-green-500', label: l('Фото', 'Фото', 'Photo') }, { type: 'file' as const, icon: File, color: 'text-blue-500', label: l('Файл', 'Файл', 'File') }, { type: 'video' as const, icon: Film, color: 'text-purple-500', label: l('Видео', 'Видео', 'Video') }].map(a => (
                            <button key={a.type} onClick={() => addAttachment(a.type)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg text-xs"><a.icon className={`w-3.5 h-3.5 ${a.color}`} />{a.label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <textarea value={newChatMessage} onChange={e => setNewChatMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }} placeholder={l('Сообщение...', 'Хабарлама...', 'Message...')} rows={1} className="flex-1 px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" style={{ minHeight: '38px', maxHeight: '100px' }} />
                    <button onClick={() => { setIsRecordingVoice(true); let d = 0; const i = setInterval(() => { d++; setRecordingDuration(d); }, 1000); setTimeout(() => clearInterval(i), 300000); }} className="p-2 hover:bg-gray-50 rounded-lg"><Mic className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={handleSendChatMessage} disabled={!newChatMessage.trim()} className={`p-2 rounded-lg transition-all ${newChatMessage.trim() ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-300'}`}><Send className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-50 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
          <button onClick={() => { alert(l('Сохранено!', 'Сақталды!', 'Saved!')); onClose(); }} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Сохранить', 'Сақтау', 'Save')}</button>
        </div>

        {/* Call Modal */}
        {showCallModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-white rounded-2xl w-72 p-6 text-center shadow-xl">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                {callType === 'voice' ? <Phone className="w-6 h-6 text-green-500" /> : <Video className="w-6 h-6 text-blue-500" />}
              </div>
              <div className="text-sm text-gray-900 mb-1">{deal.customerName}</div>
              <div className="text-xs text-gray-400 mb-4">{callType === 'voice' ? l('Голосовой звонок...', 'Дауыстық қоңырау...', 'Voice call...') : l('Видеозвонок...', 'Бейне қоңырау...', 'Video call...')}</div>
              <button onClick={() => { setShowCallModal(false); setChatMessages([...chatMessages, { id: String(Date.now()), text: callType === 'voice' ? 'Голосовой звонок' : 'Видеозвонок', time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isUser: false, type: 'call', callStatus: 'outgoing', duration: '2:45' }]); }} className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto hover:bg-red-600"><Phone className="w-5 h-5 text-white rotate-[135deg]" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}