import { useState } from 'react';
import { ChefHat, Archive, Shirt, DoorOpen, Baby, Bed, Briefcase, Box, MapPin, ChevronLeft, ChevronRight, CheckCircle2, Calendar, Send } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { api } from '../utils/api';
import { getFbTracking } from '../utils/fbTracking';

const FURNITURE = [
  { id: 'kitchen', label: 'Кухня', icon: ChefHat },
  { id: 'wardrobe', label: 'Шкаф-купе', icon: Archive },
  { id: 'dressing', label: 'Гардеробная', icon: Shirt },
  { id: 'hallway', label: 'Прихожая', icon: DoorOpen },
  { id: 'kids', label: 'Детская', icon: Baby },
  { id: 'bedroom', label: 'Спальня', icon: Bed },
  { id: 'office', label: 'Офисная', icon: Briefcase },
  { id: 'other', label: 'Другое', icon: Box },
];

const SLOTS = ['9:00–11:00', '11:00–13:00', '14:00–16:00', '16:00–18:00'];

export function Booking({ teamCode }: { teamCode?: string }) {
  const store = useDataStore();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [furnitureType, setFurnitureType] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [newBuild, setNewBuild] = useState(false);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedMeasurer, setSelectedMeasurer] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameWa, setSameWa] = useState(true);
  const [notes, setNotes] = useState('');
  const [agree, setAgree] = useState(false);
  const [done, setDone] = useState(false);
  const [trackId, setTrackId] = useState('');

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return d;
  });

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    const productLabel = FURNITURE.find(f => f.id === furnitureType)?.label || 'Изделие';
    const measurementDate = days[selectedDate || 0]?.toISOString().slice(0, 10) || '';
    const dateLabel = days[selectedDate || 0]?.toLocaleDateString('ru-RU') || '';
    const combinedNotes = [notes, landmark && `Ориентир: ${landmark}`].filter(Boolean).join('\n');
    try {
      if (teamCode) {
        // Public visitor — hit the tokenless booking endpoint. Only mark
        // "done" on a real success, so we never fake a confirmation.
        const r = await api.post<{ ok: boolean; id: string }>(`/api/booking/${encodeURIComponent(teamCode)}`, {
          name, phone, product: productLabel, address,
          measurementDate, date: dateLabel, slot: selectedSlot, notes: combinedNotes,
          ...getFbTracking(),
        });
        setTrackId(r.id);
      } else {
        // Logged-in convenience path (owner testing the flow inside the app).
        const created = store.addDeal({
          customerName: name, phone, address,
          product: productLabel, furnitureType: productLabel,
          amount: 0, paidAmount: 0, status: 'new', icon: 'phone', priority: 'medium',
          date: dateLabel, progress: 5, source: 'Сайт',
          measurer: '', designer: '', materials: '',
          measurementDate, completionDate: '', installationDate: '',
          paymentMethods: { cash: false, kaspiGold: false, kaspiQR: false, halykBank: false, cardTransfer: false, installment: false },
          notes: [combinedNotes, `Слот: ${selectedSlot}`].filter(Boolean).join('\n'),
        });
        setTrackId(created.id);
      }
      setDone(true);
    } catch (err) {
      console.error('[booking submit]', err);
      setSubmitError('Не удалось отправить запись. Проверьте соединение и попробуйте снова.');
    } finally {
      setSubmitting(false);
    }
  };

  // Build and download an .ics calendar invite for the measurement visit,
  // so the client can add it to Apple/Google/Outlook calendars in one tap.
  const saveToCalendar = () => {
    const d = days[selectedDate || 0];
    if (!d) return;
    const pad = (n: number) => String(n).padStart(2, '0');
    const parseHM = (s: string) => { const [h, m] = (s || '').trim().split(':').map(Number); return { h: h || 9, m: m || 0 }; };
    const [startStr, endStr] = selectedSlot.split('–');
    const st = parseHM(startStr), en = parseHM(endStr || startStr);
    const dt = (hh: number, mm: number) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hh)}${pad(mm)}00`;
    const productLabel = FURNITURE.find(f => f.id === furnitureType)?.label || 'Замер';
    const esc = (s: string) => (s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UTIR Soft//Booking//RU', 'BEGIN:VEVENT',
      `UID:${trackId || 'booking'}-${d.getTime()}@utir.kz`,
      `DTSTART:${dt(st.h, st.m)}`,
      `DTEND:${dt(en.h, en.m)}`,
      `SUMMARY:${esc('Замер — ' + productLabel)}`,
      `LOCATION:${esc(address)}`,
      `DESCRIPTION:${esc((selectedMeasurer ? 'Замерщик: ' + selectedMeasurer + '. ' : '') + 'Телефон: ' + phone)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'zamer.ics'; a.click();
    URL.revokeObjectURL(url);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 relative">
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-slate-900 mb-2">Запись подтверждена!</h2>
          <p className="text-xs text-slate-500 mb-1">{selectedMeasurer ? `Замерщик ${selectedMeasurer} приедет` : 'Замерщик будет назначен'}</p>
          <p className="text-sm text-slate-900 mb-4">{days[selectedDate || 0]?.toLocaleDateString('ru-RU')} в {selectedSlot}</p>
          <p className="text-[11px] text-slate-400 mb-1">За день до визита мы отправим напоминание в WhatsApp.</p>
          <p className="text-[11px] text-slate-400 mb-5">Ссылка для отслеживания: <a href={`#/track/${trackId}`} className="text-gray-900">utir.kz/track/{trackId}</a></p>
          <div className="space-y-2">
            <a href="https://t.me/UtirSoftBot" className="block w-full py-2.5 bg-sky-500 text-white rounded-xl text-xs hover:bg-sky-600 flex items-center justify-center gap-1.5"><Send className="w-3.5 h-3.5" /> Открыть в Telegram</a>
            <button onClick={saveToCalendar} className="w-full py-2.5 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-xl text-xs hover:bg-white/80 flex items-center justify-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Сохранить в календарь</button>
            <a href="#/" className="block w-full py-2.5 text-slate-500 rounded-xl text-xs hover:text-gray-900">На главную</a>
          </div>
        </div>
      </div>
    );
  }

  const canNext = (
    (step === 0 && furnitureType) ||
    (step === 1 && address) ||
    (step === 2 && selectedDate !== null && selectedSlot) ||
    (step === 3 && name && phone) ||
    (step === 4 && agree)
  );

  return (
    <div className="min-h-screen relative">
      <div className="bg-white/70 backdrop-blur-2xl backdrop-saturate-150 border-b border-slate-200/60 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-xs">U</div>
            <div className="text-sm text-gray-900">Запись на замер</div>
          </div>
          <a href="#/" className="text-[11px] text-slate-400">utir.kz</a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-5">
        <div className="flex gap-1.5 mb-5">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-emerald-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5 mb-4 min-h-[400px]">
          {step === 0 && (
            <>
              <h2 className="text-slate-900 mb-4">Что нужно?</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FURNITURE.map(f => {
                  const I = f.icon;
                  return (
                    <button key={f.id} onClick={() => setFurnitureType(f.id)}
                      className={`p-4 rounded-2xl border text-center transition ${furnitureType === f.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:bg-white/50'}`}>
                      <I className="w-6 h-6 mx-auto mb-2 text-slate-700" />
                      <div className="text-xs text-gray-900">{f.label}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-slate-900 mb-4">Адрес объекта</h2>
              <div className="space-y-3">
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="ул. Абая 45, кв. 12"
                  className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <input value={landmark} onChange={e => setLandmark(e.target.value)} placeholder="Подъезд, этаж, код домофона, ориентир"
                  className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-slate-400" /> Укажите точный адрес — замерщик приедет по нему.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newBuild} onChange={() => setNewBuild(!newBuild)} />
                  <span className="text-xs text-slate-700">Это новостройка / квартира на ремонте</span>
                </label>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-slate-900 mb-4">Когда удобно?</h2>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {days.map((d, i) => (
                  <button key={i} onClick={() => setSelectedDate(i)}
                    className={`p-2 rounded-xl text-center ${selectedDate === i ? 'bg-emerald-600 text-white' : 'bg-white/60 ring-1 ring-white/60 text-slate-700 hover:bg-white/80'}`}>
                    <div className="text-[10px] opacity-70">{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()]}</div>
                    <div className="text-xs">{d.getDate()}</div>
                  </button>
                ))}
              </div>
              {selectedDate !== null && (
                <div className="space-y-2">
                  {SLOTS.map(slot => (
                    <button key={slot} onClick={() => setSelectedSlot(slot)}
                      className={`w-full p-3 rounded-xl flex items-center justify-between text-xs ${selectedSlot === slot ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                      <span>{slot}</span>
                      <span className="text-[10px]">{selectedSlot === slot ? 'Выбрано' : 'Свободно'}</span>
                    </button>
                  ))}
                  <p className="text-[11px] text-slate-400 pt-1">Замерщика назначим автоматически и пришлём его имя в WhatsApp.</p>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-slate-900 mb-4">Контакты</h2>
              <div className="space-y-3">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя"
                  className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__"
                  className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={sameWa} onChange={() => setSameWa(!sameWa)} />
                  <span className="text-xs text-slate-700">WhatsApp на этом же номере</span>
                </label>
                {!sameWa && (
                  <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="WhatsApp номер"
                    className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                )}
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Дополнительные пожелания" rows={3}
                  className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none" />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-slate-900 mb-4">Подтверждение</h2>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-xs mb-4">
                <div className="flex justify-between"><span className="text-slate-400">Тип</span><span className="text-gray-900">{FURNITURE.find(f => f.id === furnitureType)?.label}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Адрес</span><span className="text-gray-900 text-right">{address}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Дата</span><span className="text-gray-900">{days[selectedDate!]?.toLocaleDateString('ru-RU')} {selectedSlot}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Замерщик</span><span className="text-gray-900">{selectedMeasurer || 'Будет назначен'}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Имя</span><span className="text-gray-900">{name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Телефон</span><span className="text-gray-900">{phone}</span></div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={agree} onChange={() => setAgree(!agree)} className="mt-0.5" />
                <span className="text-xs text-slate-700">Согласен на обработку персональных данных</span>
              </label>
            </>
          )}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 px-4 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white/80 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Назад
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button onClick={() => canNext && setStep(step + 1)} disabled={!canNext}
              className="flex items-center gap-1 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40">
              Далее <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={submit} disabled={!agree || submitting}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 disabled:opacity-40">
              {submitting ? 'Отправка…' : 'Подтвердить запись'}
            </button>
          )}
        </div>
        {submitError && (
          <p className="mt-3 text-xs text-rose-600 text-right">{submitError}</p>
        )}
      </div>
    </div>
  );
}
