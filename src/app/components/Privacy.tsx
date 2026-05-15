import { LegalPage, LegalSection } from './LegalPage';

interface Props {
  language: 'kz' | 'ru' | 'eng';
  onLanguageChange: (lang: 'kz' | 'ru' | 'eng') => void;
}

export function Privacy({ language, onLanguageChange }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  return (
    <LegalPage
      language={language}
      onLanguageChange={onLanguageChange}
      title={l('Политика конфиденциальности', 'Құпиялылық саясаты', 'Privacy Policy')}
      updated={l('Редакция от 15 мая 2026 г.', '2026 жылғы 15 мамырдағы редакция', 'Last updated: May 15, 2026')}
    >
      <p>
        {l(
          'Настоящая Политика описывает, какие персональные данные собирает платформа Utir Soft (далее — «Сервис»), для каких целей они используются и какие права имеет Пользователь в отношении своих данных. Используя Сервис, Пользователь даёт согласие на обработку персональных данных в соответствии с настоящей Политикой и законодательством Республики Казахстан о персональных данных и их защите.',
          'Осы Саясат Utir Soft платформасы (бұдан әрі — «Сервис») қандай дербес деректерді жинайтынын, олардың қандай мақсатта пайдаланылатынын және Пайдаланушының өз деректеріне қатысты қандай құқықтары бар екенін сипаттайды. Сервисті пайдалана отырып, Пайдаланушы дербес деректерді осы Саясатқа және Қазақстан Республикасының дербес деректер туралы заңнамасына сәйкес өңдеуге келісім береді.',
          'This Policy describes what personal data the Utir Soft platform (the "Service") collects, the purposes of processing, and the User\'s rights regarding their data. By using the Service, the User consents to the processing of personal data in accordance with this Policy and the personal data legislation of the Republic of Kazakhstan.'
        )}
      </p>

      <LegalSection num={1} title={l('Какие данные мы собираем', 'Қандай деректерді жинаймыз', 'Data we collect')}>
        <p>{l('При регистрации: имя, адрес электронной почты, название компании, пароль (в виде криптографического хэша).', 'Тіркелу кезінде: есім, электрондық пошта мекенжайы, компания атауы, құпия сөз (криптографиялық хэш түрінде).', 'At registration: name, email address, company name, password (stored as a cryptographic hash).')}</p>
        <p>{l('В ходе использования: данные о клиентах, заказах, сотрудниках, финансовых операциях и иной информации, которую Пользователь вносит в Сервис самостоятельно.', 'Пайдалану барысында: Пайдаланушы Сервиске өзі енгізетін клиенттер, тапсырыстар, қызметкерлер, қаржы операциялары және өзге де ақпарат туралы деректер.', 'During use: data about clients, orders, employees, financial transactions and other information that the User enters into the Service.')}</p>
        <p>{l('Автоматически: техническая информация — IP-адрес, тип браузера, время доступа, действия в системе (для журнала действий и аналитики).', 'Автоматты түрде: техникалық ақпарат — IP-мекенжай, браузер түрі, кіру уақыты, жүйедегі әрекеттер (әрекеттер журналы және аналитика үшін).', 'Automatically: technical information — IP address, browser type, access time, in-app actions (for the activity log and analytics).')}</p>
      </LegalSection>

      <LegalSection num={2} title={l('Цели обработки', 'Өңдеу мақсаттары', 'Purposes of processing')}>
        <p>{l('Идентификация Пользователя и предоставление доступа к Сервису.', 'Пайдаланушыны сәйкестендіру және Сервиске қол жеткізуді қамтамасыз ету.', 'Identifying the User and granting access to the Service.')}</p>
        <p>{l('Обеспечение работоспособности и улучшение функциональности Сервиса.', 'Сервистің жұмыс қабілеттілігін қамтамасыз ету және функционалын жақсарту.', 'Maintaining and improving Service functionality.')}</p>
        <p>{l('Связь с Пользователем по вопросам сервисного обслуживания, безопасности и существенных изменений.', 'Сервистік қызмет көрсету, қауіпсіздік және елеулі өзгерістер мәселелері бойынша Пайдаланушымен байланыс.', 'Communicating with the User about service, security and material changes.')}</p>
        <p>{l('Соблюдение требований законодательства, в том числе налогового и о персональных данных.', 'Заңнама талаптарын, оның ішінде салықтық және дербес деректер туралы талаптарды сақтау.', 'Compliance with legal requirements, including tax and personal data laws.')}</p>
      </LegalSection>

      <LegalSection num={3} title={l('Правовое основание обработки', 'Өңдеудің құқықтық негізі', 'Legal basis for processing')}>
        <p>{l('Обработка осуществляется на основании согласия Пользователя, выраженного при регистрации (отметка о согласии с настоящей Политикой), а также для исполнения договора об использовании Сервиса.', 'Өңдеу Пайдаланушының тіркелу кезінде білдірген келісімі (осы Саясатпен келісу белгісі), сондай-ақ Сервисті пайдалану туралы шартты орындау негізінде жүзеге асырылады.', 'Processing is based on the User\'s consent given at registration (acceptance of this Policy) and on the performance of the Service-use agreement.')}</p>
      </LegalSection>

      <LegalSection num={4} title={l('Сроки хранения', 'Сақтау мерзімдері', 'Retention')}>
        <p>{l('Персональные данные хранятся в течение всего срока действия аккаунта Пользователя и в течение разумного времени после его удаления, необходимого для исполнения обязательств и соблюдения требований законодательства.', 'Дербес деректер Пайдаланушы аккаунтының қолданылу мерзімі ішінде және оны жоюдан кейін міндеттемелерді орындау мен заңнама талаптарын сақтау үшін қажетті ақылға қонымды уақыт ішінде сақталады.', 'Personal data is retained for the duration of the User\'s account and for a reasonable period after its deletion as required to fulfil obligations and comply with the law.')}</p>
        <p>{l('После удаления аккаунта данные удаляются или обезличиваются, за исключением информации, которую необходимо хранить в силу прямого требования законодательства (например, бухгалтерская отчётность).', 'Аккаунт жойылғаннан кейін деректер жойылады немесе анонимдендіріледі, тек заңнаманың тікелей талабы бойынша сақтау қажет ақпарат (мысалы, бухгалтерлік есеп) сақталады.', 'After account deletion, data is erased or anonymised, except for information that must be retained by direct legal requirement (e.g., accounting records).')}</p>
      </LegalSection>

      <LegalSection num={5} title={l('Передача третьим лицам', 'Үшінші тұлғаларға беру', 'Sharing with third parties')}>
        <p>{l('Сервис не продаёт и не передаёт персональные данные Пользователей третьим лицам в коммерческих целях.', 'Сервис коммерциялық мақсатта Пайдаланушылардың дербес деректерін үшінші тұлғаларға сатпайды және бермейді.', 'The Service does not sell or share Users\' personal data with third parties for commercial purposes.')}</p>
        <p>{l('Данные могут передаваться: поставщикам инфраструктуры (хостинг, базы данных) на основании договоров о неразглашении; компетентным государственным органам при наличии законного запроса.', 'Деректер: инфрақұрылым жеткізушілеріне (хостинг, дерекқорлар) құпиялылық шарттары негізінде; заңды сұраныс болған жағдайда құзыретті мемлекеттік органдарға берілуі мүмкін.', 'Data may be shared with: infrastructure providers (hosting, databases) under confidentiality agreements; competent state authorities upon lawful request.')}</p>
      </LegalSection>

      <LegalSection num={6} title={l('Файлы cookie и аналитика', 'Cookie файлдары және аналитика', 'Cookies and analytics')}>
        <p>{l('Сервис использует cookie и локальное хранилище браузера для поддержания сессии пользователя, сохранения настроек интерфейса и базовой аналитики использования.', 'Сервис пайдаланушы сеансын ұстап тұру, интерфейс параметрлерін сақтау және пайдаланудың негізгі аналитикасы үшін cookie мен браузердің жергілікті жадын пайдаланады.', 'The Service uses cookies and browser local storage to maintain the user session, save interface preferences and capture basic usage analytics.')}</p>
      </LegalSection>

      <LegalSection num={7} title={l('Безопасность данных', 'Деректер қауіпсіздігі', 'Data security')}>
        <p>{l('Сервис применяет современные технические и организационные меры защиты: передача данных по HTTPS, хранение паролей в виде криптографических хэшей (bcrypt), ограничение доступа сотрудников по принципу минимально необходимого.', 'Сервис заманауи техникалық және ұйымдастырушылық қорғау шараларын қолданады: деректерді HTTPS арқылы беру, құпия сөздерді криптографиялық хэш түрінде сақтау (bcrypt), қызметкерлердің қол жеткізуін ең аз қажетті қағидаты бойынша шектеу.', 'The Service applies modern technical and organizational safeguards: HTTPS transport, password storage as cryptographic hashes (bcrypt), least-privilege access for staff.')}</p>
        <p>{l('Несмотря на принимаемые меры, Сервис не может гарантировать абсолютную защиту от несанкционированного доступа в результате действий, выходящих за рамки разумного контроля.', 'Қабылданған шараларға қарамастан, Сервис ақылға қонымды бақылау шеңберінен тыс әрекеттер нәтижесінде рұқсатсыз қол жеткізуден абсолютті қорғауға кепілдік бере алмайды.', 'Despite these measures, the Service cannot guarantee absolute protection against unauthorized access caused by events beyond reasonable control.')}</p>
      </LegalSection>

      <LegalSection num={8} title={l('Права Пользователя', 'Пайдаланушының құқықтары', 'User rights')}>
        <p>{l('Пользователь имеет право: получить доступ к своим персональным данным; запросить их исправление; отозвать согласие на обработку и потребовать удаления; получить копию данных в машиночитаемом формате.', 'Пайдаланушының: өзінің дербес деректеріне қол жеткізуге; оларды түзетуді сұрауға; өңдеуге келісімді қайтарып алуға және жоюды талап етуге; деректердің көшірмесін машинамен оқылатын форматта алуға құқығы бар.', 'The User has the right to: access their personal data; request its correction; withdraw consent and request deletion; obtain a machine-readable copy.')}</p>
        <p>{l('Запросы направляются по контактным данным, указанным в разделе «Контакты». Сервис рассматривает запрос в течение разумного срока и сообщает результат.', 'Сұраулар «Байланыс» бөлімінде көрсетілген байланыс деректері бойынша жіберіледі. Сервис сұрауды ақылға қонымды мерзім ішінде қарайды және нәтижені хабарлайды.', 'Requests should be sent to the contact details listed in the "Contacts" section. The Service reviews the request within a reasonable period and reports the outcome.')}</p>
      </LegalSection>

      <LegalSection num={9} title={l('Несовершеннолетние пользователи', 'Кәмелетке толмаған пайдаланушылар', 'Minors')}>
        <p>{l('Сервис не предназначен для лиц, не достигших 18 лет. Если станет известно, что аккаунт зарегистрирован несовершеннолетним без согласия родителей или законных представителей, такой аккаунт может быть удалён.', 'Сервис 18 жасқа толмаған тұлғаларға арналмаған. Аккаунт ата-ананың немесе заңды өкілдердің келісімінсіз кәмелетке толмаған тұлғаға тіркелгені белгілі болса, мұндай аккаунт жойылуы мүмкін.', 'The Service is not intended for persons under 18. If it becomes known that an account was registered by a minor without parental or guardian consent, such an account may be removed.')}</p>
      </LegalSection>

      <LegalSection num={10} title={l('Международные передачи', 'Халықаралық беру', 'International transfers')}>
        <p>{l('Серверы Сервиса могут располагаться за пределами Республики Казахстан. Любая передача данных за рубеж осуществляется в соответствии с требованиями законодательства о трансграничной передаче персональных данных.', 'Сервистің серверлері Қазақстан Республикасынан тыс жерлерде орналасуы мүмкін. Деректерді шетелге кез келген беру дербес деректерді трансшекаралық беру туралы заңнама талаптарына сәйкес жүзеге асырылады.', 'The Service\'s servers may be located outside the Republic of Kazakhstan. Any cross-border data transfer is performed in compliance with cross-border personal data legislation.')}</p>
      </LegalSection>

      <LegalSection num={11} title={l('Изменение Политики', 'Саясатты өзгерту', 'Changes to the Policy')}>
        <p>{l('Сервис вправе обновлять настоящую Политику. О существенных изменениях Пользователь уведомляется по электронной почте либо через интерфейс Сервиса не позднее, чем за 14 дней до их вступления в силу.', 'Сервис осы Саясатты жаңартуға құқылы. Елеулі өзгерістер туралы Пайдаланушы электрондық пошта арқылы немесе Сервис интерфейсі арқылы олардың күшіне енуінен кемінде 14 күн бұрын хабарланады.', 'The Service may update this Policy. Material changes are communicated to the User by email or via the Service interface no later than 14 days before they take effect.')}</p>
      </LegalSection>

      <LegalSection num={12} title={l('Контакты', 'Байланыс', 'Contacts')}>
        <p>{l('Замените в финальной версии: укажите официальное наименование оператора персональных данных, БИН, адрес местонахождения, контактный e-mail и Ф.И.О. ответственного за обработку персональных данных.', 'Қорытынды нұсқада ауыстырыңыз: дербес деректер операторының ресми атауын, БСН, орналасқан мекенжайын, байланыс e-mail-ін және дербес деректерді өңдеуге жауапты тұлғаның Т.А.Ә. көрсетіңіз.', 'Replace in the final version: state the personal data operator\'s legal name, BIN, registered address, contact email and the name of the data protection officer.')}</p>
      </LegalSection>
    </LegalPage>
  );
}
