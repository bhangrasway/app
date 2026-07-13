// ============================================================================
// Shared translations for the public student pages (home / checkin / report).
// Languages: English, Italiano, Punjabi (Latin script, not Gurmukhi, per the
// studio's preference: the community reads romanized Punjabi on phones).
//
// Usage:
//   * Static HTML: tag elements with data-i18n="key" (textContent) or
//     data-i18n-placeholder="key" (input placeholder). Applied on page load
//     and on every language switch.
//   * Dynamic JS strings: call t('key', {vars}) at the moment you set them.
//   * A page can define window.onLangChange = () => {...} to re-render its
//     dynamic (state-dependent) texts when the user switches language.
//   * Drop <div class="lang-picker" id="langPicker"></div> in the page and
//     a flag-only dropdown renders itself. Choice persists in localStorage.
// ============================================================================

const I18N = {
    en: {
        lang_label: 'EN',
        home: 'Home',
        // home.html
        what_would: 'What would you like to do?',
        mark_attendance: '✅ Mark Attendance',
        see_report: '📋 See Your Report',
        // shared flow
        continue: 'Continue',
        searching: 'Searching…',
        phone_placeholder: 'e.g. 333 123 4567',
        enter_phone: 'Enter the mobile number we have on file for you.',
        phone_invalid: 'Enter your full mobile number (at least 9 digits).',
        phone_not_found: "We couldn't find that number. Double-check it, or ask your instructor.",
        something_wrong: 'Something went wrong. Please try again or ask your instructor.',
        who_are_you: 'Who are you?',
        pick_self: 'More than one member is registered under this number, pick yourself.',
        use_diff_number: '← Use a different number',
        // checkin.html
        checking_in_pending: '📍 Checking in…',
        branch_confirmed: "📍✓ You're at our Cremona branch",
        branch_default: "📍 You're checking in at our Cremona branch",
        closed_heading: "Check-in isn't open right now",
        closed_msg: 'Check-in is open {days}, {start} - {end}. Come back then!',
        not_setup: "Check-in isn't set up yet. Please ask your instructor.",
        notify_from_closed: "Can't check in? Notify your instructor",
        too_far_heading: 'You seem far from the studio',
        too_far_body: "Your phone's location says you're more than 500m from Bhangra Sway Cremona, so self check-in is blocked. Maybe your browser hasn't shared your location correctly, you can notify your instructor instead.",
        loc_unknown_heading: "We couldn't verify your location",
        loc_unknown_body: "Self check-in needs your phone's location to confirm you're at the studio. Allow location access and try again — or send a request and your instructor will mark you present.",
        retry_location: "I've enabled location — try again",
        request_attendance: 'Request Attendance',
        mark_yourself: 'Mark yourself present',
        notify_heading: 'Notify your instructor',
        enter_phone_notify: 'Enter the mobile number we have on file for you, your instructor will mark you present manually.',
        greeting: 'Hi, {name} 👋',
        ready_to_mark: 'Ready to mark yourself present for today?',
        send_request_q: 'Send a request so your instructor marks you present manually?',
        confirm_checkin: 'Confirm Check-In',
        send_to_instructor: 'Send to Instructor',
        not_you: 'Not you? Use a different number',
        checking_in_btn: 'Checking in…',
        sending: 'Sending…',
        checked_in_title: "You're checked in!",
        see_you_in_class: 'See you in class, {name}.',
        already_title: 'Already checked in',
        already_sub: "{name}, you're already marked present today.",
        already_marked_sub: '{name}, your attendance was already marked for today.',
        instructor_notified: 'Instructor notified',
        will_mark_manually: '{name}, your instructor will mark you present manually.',
        notify_failed: 'Could not send notification',
        try_again_or_ask: 'Please try again, or ask your instructor directly.',
        checkin_someone_else: 'Check in someone else',
        day_0: 'Sunday', day_1: 'Monday', day_2: 'Tuesday', day_3: 'Wednesday',
        day_4: 'Thursday', day_5: 'Friday', day_6: 'Saturday',
        // report.html
        error_heading: 'Something went wrong',
        view_report: 'View Your Report',
        report_hi: 'Hi,',
        progress_intro: "Here's your Bhangra progress report.",
        attendance_heading: '📅 Attendance (last 2 months)',
        classes_attended_suffix: 'classes attended',
        no_attendance: 'No attendance records',
        launch_note: 'ℹ️ Classes before June 2026 are not recorded here.',
        membership_heading: '💳 Membership Status',
        guarantee_note: "ℹ️ Don't worry, every cycle guarantees you 4 classes. If you miss some, your plan automatically extends (up to 2 months) until you get all 4.",
        current_cycle: 'Current Cycle',
        previous_cycle: 'Previous Cycle',
        badge_paid: '🟢 Active / Paid',
        badge_overdue: '🔴 Overdue',
        badge_unpaid: '🟡 Payment Pending',
        month_one: 'month', month_many: 'months',
        overdue_note: '🔴 You have {months} overdue (€{amount}), please pay your fees as soon as possible.',
        extended_tag: '⏳ extended',
        pill_paid: '✅ Paid',
        pill_unpaid: '❌ Unpaid',
        classes_progress: '{a}/{b} classes attended',
        extra_gifted_one: ', {n} extra class gifted! 🎁',
        extra_gifted_many: ', {n} extra classes gifted! 🎁',
        carried_note: ' (incl. {n} carried over)',
        starts_first_class: 'Starts on your first class',
        demo_taken_pill: '🎁 Demo taken',
        na: 'N/A',
        demo_note: '🎁 Demo class taken, your plan officially starts on your next attended class.',
        paused_note: '⏸ Your plan is paused, {a}/{b} classes will carry over when you return.',
        more_classes_one: '{n} more class',
        more_classes_many: '{n} more classes',
        ext_note_paid: "⏳ No rush, you're at {a}/{b} classes this cycle. It'll wrap up after {left} or {date} (dates auto-extend if you don't come).",
        ext_note_unpaid: "⏳ Your plan cycle will change after {left} or {date} (dates auto-extend if you don't come), since you're unpaid, please pay as soon as possible.",
        payments_heading: '💶 Payments',
        last_payment: 'Last Payment',
        total_pending: 'Total Pending',
        no_payments: 'No payments yet',
        cycles_unpaid_one: '{n} cycle unpaid',
        cycles_unpaid_many: '{n} cycles unpaid',
        caught_up: 'All caught up! 🎉',
        next_payment_note: '🎉 Congratulations! Your next payment is due after {date}, or after {left} attended ({a}/{b} so far this cycle), whichever comes first.',
        advance_paid_note_one: '🎉 Great news! Your next cycle is already paid in advance — nothing more to pay right now. Your next payment will most probably be due after {date} if you attend regularly (otherwise it extends automatically).',
        advance_paid_note_many: '🎉 Great news! Your next {n} cycles are already paid in advance — nothing more to pay right now. Your next payment will most probably be due after {date} if you attend regularly (otherwise it extends automatically).',
        someone_else_report: "Check someone else's report",
        verify_failed: "We couldn't verify you, please ask your instructor.",
        report_load_failed: 'Could not load your report ({err}). Please try again.',

        // Public marketing homepage (index.html)
        nav_classes: 'Classes',
        nav_services: 'Services',
        nav_events: 'Events',
        nav_trial: 'Free Trial',
        nav_videos: 'Videos',
        nav_gallery: 'Gallery',
        nav_contact: 'Contact',
        nav_members: 'Members',
        nav_media: 'Media',
        tt_follow_btn: 'Follow us on TikTok',
        fb_like_btn: 'Like our page on Facebook',
        hero_tagline: 'Feel the Rhythm of Punjab, Here in Cremona',
        about_heading: 'About Us',
        about_body: 'Bhangra Sway Cremona brings the energy of Punjabi Bhangra to Cremona, Italy. We welcome kids and adults, complete beginners and seasoned dancers, from the local Punjabi community and anyone curious about Bhangra. No experience needed to get started.',
        classes_heading: 'Our Classes',
        classes_note: 'Timings may vary occasionally, please message or call ahead before coming.',
        class_advance_name: 'Advance',
        class_advance_time: 'Saturday, 1:30 PM – 3:30 PM',
        class_advance_desc: "For dancers who've passed an Intermediate batch, or are already skilled and want to go deeper.",
        class_intermediate_name: 'Intermediate',
        class_intermediate_time: 'Saturday, 3:30 PM – 5:30 PM',
        class_intermediate_desc: "Best for dancers who've learned elsewhere, or who've completed our Beginner class.",
        class_beginner_name: 'Beginner',
        class_beginner_time: 'Sunday, 2:00 PM – 4:00 PM',
        class_beginner_desc: "Best for absolute zero level — whether you're a teenager or an adult, no experience needed.",
        directions_btn: 'Get Directions',
        services_heading: 'Other Services',
        services_note: 'Beyond weekly classes, we bring Bhangra to your events.',
        service_wedding_title: 'Wedding Choreography',
        service_wedding_body: 'Custom-choreographed Bhangra routines for your sangeet or wedding day.',
        service_personal_title: 'Personal Classes',
        service_personal_body: 'One-on-one or small-group private lessons at your own pace.',
        service_rental_title: 'Prop & Costume Rental',
        service_rental_body: 'Traditional Bhangra props and outfits available to rent for your event.',
        service_performances_title: 'Event Performances',
        service_performances_body: 'We perform at weddings, festivals, and private or corporate occasions.',
        services_cta: 'Ask About This Service',
        events_heading: 'Upcoming Events',
        recent_events_heading: 'Recent Events',
        event_castelvetro_title: 'Performance by our students',
        event_competition_title: 'In-Studio Bhangra Competition',
        events_empty_note: 'No events scheduled right now, follow us for updates.',
        events_follow_instagram: 'Follow on Instagram',
        events_follow_whatsapp: 'Ask on WhatsApp',
        trial_heading: 'New Here? Try a Class for Free',
        trial_body: "Every new dancer gets a free demo class, no strings attached. Message us on WhatsApp and we'll set it up.",
        trial_btn: 'Book Your Free Trial',
        videos_heading: 'Watch Us Dance',
        videos_note: 'Highlights from our classes and performances.',
        videos_empty_note: "New videos are on their way, subscribe so you don't miss them.",
        videos_cta: 'Visit Our YouTube Channel',
        videos_follow: 'Follow us:',
        social_ig_heading: 'Follow Us on Instagram',
        social_yt_heading: 'Latest YouTube Videos',
        ig_empty_note: 'Our latest reels and photos live on Instagram, come say hi!',
        gallery_heading: 'Gallery',
        gallery_note: 'Highlights from our classes and performances.',
        gallery_empty_note: 'Photos from our classes and performances, coming soon!',
        contact_heading: 'Get In Touch',
        nav_reviews: 'Reviews',
        reviews_heading: 'What Our Members Say',
        reviews_read_all: 'Read All Reviews on Google',
        reviews_invite: 'Tried our classes? Share your experience on Google.',
        reviews_write: 'Write a Review',
        footer_tagline: 'One of the best Bhangra studios in Italy, led by an experienced coach from Punjab who makes learning Bhangra easy.',
        footer_quick_links: 'Quick Links',
        footer_contact_heading: 'Contact',
        footer_address_label: 'Via Magazzini Generali, 26100 Cremona CR',
        footer_rights: 'All rights reserved.',
        footer_members: 'Members Login'
    },

    it: {
        lang_label: 'IT',
        home: 'Home',
        what_would: 'Cosa vuoi fare?',
        mark_attendance: '✅ Segna la presenza',
        see_report: '📋 Vedi il tuo report',
        continue: 'Continua',
        searching: 'Ricerca…',
        phone_placeholder: 'es. 333 123 4567',
        enter_phone: 'Inserisci il numero di cellulare che abbiamo registrato per te.',
        phone_invalid: 'Inserisci il numero di cellulare completo (almeno 9 cifre).',
        phone_not_found: 'Numero non trovato. Ricontrollalo, o chiedi al tuo istruttore.',
        something_wrong: 'Qualcosa è andato storto. Riprova o chiedi al tuo istruttore.',
        who_are_you: 'Chi sei?',
        pick_self: 'Più di un membro è registrato con questo numero, scegli il tuo nome.',
        use_diff_number: '← Usa un altro numero',
        checking_in_pending: '📍 Check-in in corso…',
        branch_confirmed: '📍✓ Sei nella nostra sede di Cremona',
        branch_default: '📍 Stai facendo il check-in nella sede di Cremona',
        closed_heading: 'Il check-in non è aperto adesso',
        closed_msg: 'Il check-in è aperto {days}, {start} - {end}. Torna a quell\'ora!',
        not_setup: 'Il check-in non è ancora configurato. Chiedi al tuo istruttore.',
        notify_from_closed: 'Non riesci a fare il check-in? Avvisa il tuo istruttore',
        too_far_heading: 'Sembri lontano dallo studio',
        too_far_body: 'La posizione del tuo telefono indica che sei a più di 500 m da Bhangra Sway Cremona, quindi il check-in autonomo è bloccato. Forse il browser non ha condiviso bene la posizione, puoi avvisare il tuo istruttore.',
        loc_unknown_heading: 'Non riusciamo a verificare la tua posizione',
        loc_unknown_body: 'Il check-in autonomo ha bisogno della posizione del telefono per confermare che sei in palestra. Attiva la posizione e riprova — oppure invia una richiesta e il tuo istruttore ti segnerà presente.',
        retry_location: 'Ho attivato la posizione — riprova',
        request_attendance: 'Richiedi la presenza',
        mark_yourself: 'Segna la tua presenza',
        notify_heading: 'Avvisa il tuo istruttore',
        enter_phone_notify: 'Inserisci il numero di cellulare registrato, il tuo istruttore segnerà la presenza manualmente.',
        greeting: 'Ciao, {name} 👋',
        ready_to_mark: 'Pronto a segnare la tua presenza di oggi?',
        send_request_q: 'Inviare una richiesta così il tuo istruttore segna la presenza manualmente?',
        confirm_checkin: 'Conferma il check-in',
        send_to_instructor: 'Invia all\'istruttore',
        not_you: 'Non sei tu? Usa un altro numero',
        checking_in_btn: 'Check-in in corso…',
        sending: 'Invio…',
        checked_in_title: 'Check-in fatto!',
        see_you_in_class: 'Ci vediamo a lezione, {name}.',
        already_title: 'Check-in già fatto',
        already_sub: '{name}, risulti già presente oggi.',
        already_marked_sub: '{name}, la tua presenza di oggi era già segnata.',
        instructor_notified: 'Istruttore avvisato',
        will_mark_manually: '{name}, il tuo istruttore segnerà la tua presenza manualmente.',
        notify_failed: 'Impossibile inviare la notifica',
        try_again_or_ask: 'Riprova, o chiedi direttamente al tuo istruttore.',
        checkin_someone_else: 'Fai il check-in di qualcun altro',
        day_0: 'Domenica', day_1: 'Lunedì', day_2: 'Martedì', day_3: 'Mercoledì',
        day_4: 'Giovedì', day_5: 'Venerdì', day_6: 'Sabato',
        error_heading: 'Qualcosa è andato storto',
        view_report: 'Vedi il tuo report',
        report_hi: 'Ciao,',
        progress_intro: 'Ecco il tuo report dei progressi di Bhangra.',
        attendance_heading: '📅 Presenze (ultimi 2 mesi)',
        classes_attended_suffix: 'lezioni frequentate',
        no_attendance: 'Nessuna presenza registrata',
        launch_note: 'ℹ️ Le lezioni prima di giugno 2026 non sono registrate qui.',
        membership_heading: '💳 Stato abbonamento',
        guarantee_note: 'ℹ️ Tranquillo, ogni ciclo ti garantisce 4 lezioni. Se ne salti qualcuna, il piano si estende automaticamente (fino a 2 mesi) finché non le fai tutte e 4.',
        current_cycle: 'Ciclo attuale',
        previous_cycle: 'Ciclo precedente',
        badge_paid: '🟢 Attivo / Pagato',
        badge_overdue: '🔴 In ritardo',
        badge_unpaid: '🟡 Pagamento in sospeso',
        month_one: 'mese', month_many: 'mesi',
        overdue_note: '🔴 Hai {months} in ritardo (€{amount}), per favore paga la quota il prima possibile.',
        extended_tag: '⏳ estesa',
        pill_paid: '✅ Pagato',
        pill_unpaid: '❌ Da pagare',
        classes_progress: '{a}/{b} lezioni frequentate',
        extra_gifted_one: ', {n} lezione extra in regalo! 🎁',
        extra_gifted_many: ', {n} lezioni extra in regalo! 🎁',
        carried_note: ' (incl. {n} riportate)',
        starts_first_class: 'Inizia alla tua prima lezione',
        demo_taken_pill: '🎁 Prova fatta',
        na: 'N/D',
        demo_note: '🎁 Lezione di prova fatta, il tuo piano parte ufficialmente dalla prossima lezione frequentata.',
        paused_note: '⏸ Il tuo piano è in pausa, {a}/{b} lezioni saranno riportate quando torni.',
        more_classes_one: 'ancora {n} lezione',
        more_classes_many: 'ancora {n} lezioni',
        ext_note_paid: '⏳ Nessuna fretta, sei a {a}/{b} lezioni in questo ciclo. Si chiuderà dopo {left} o il {date} (le date si estendono da sole se non vieni).',
        ext_note_unpaid: '⏳ Il tuo ciclo cambierà dopo {left} o il {date} (le date si estendono da sole se non vieni), il pagamento è in sospeso, per favore paga il prima possibile.',
        payments_heading: '💶 Pagamenti',
        last_payment: 'Ultimo pagamento',
        total_pending: 'Totale da pagare',
        no_payments: 'Nessun pagamento',
        cycles_unpaid_one: '{n} ciclo da pagare',
        cycles_unpaid_many: '{n} cicli da pagare',
        caught_up: 'Tutto in regola! 🎉',
        next_payment_note: '🎉 Congratulazioni! Il prossimo pagamento è dovuto dopo il {date}, o dopo {left} frequentate ({a}/{b} finora in questo ciclo), quello che arriva prima.',
        advance_paid_note_one: '🎉 Ottima notizia! Il tuo prossimo ciclo è già pagato in anticipo — per ora non c\'è altro da pagare. Il prossimo pagamento sarà molto probabilmente dovuto dopo il {date} se frequenti regolarmente (altrimenti si estende automaticamente).',
        advance_paid_note_many: '🎉 Ottima notizia! I tuoi prossimi {n} cicli sono già pagati in anticipo — per ora non c\'è altro da pagare. Il prossimo pagamento sarà molto probabilmente dovuto dopo il {date} se frequenti regolarmente (altrimenti si estende automaticamente).',
        someone_else_report: 'Vedi il report di qualcun altro',
        verify_failed: 'Non siamo riusciti a verificarti, chiedi al tuo istruttore.',
        report_load_failed: 'Impossibile caricare il report ({err}). Riprova.',

        // Public marketing homepage (index.html)
        nav_classes: 'Corsi',
        nav_services: 'Servizi',
        nav_events: 'Eventi',
        nav_trial: 'Prova Gratuita',
        nav_videos: 'Video',
        nav_gallery: 'Galleria',
        nav_contact: 'Contatti',
        nav_members: 'Area Soci',
        nav_media: 'Media',
        tt_follow_btn: 'Seguici su TikTok',
        fb_like_btn: 'Metti "Mi piace" alla nostra pagina Facebook',
        hero_tagline: 'Vivi il Ritmo del Punjab, Qui a Cremona',
        about_heading: 'Chi Siamo',
        about_body: "Bhangra Sway Cremona porta l'energia del Bhangra punjabi a Cremona. Accogliamo bambini e adulti, principianti assoluti e ballerini esperti, dalla comunità punjabi locale e chiunque sia curioso di scoprire il Bhangra. Non serve esperienza per iniziare.",
        classes_heading: 'I Nostri Corsi',
        classes_note: "Gli orari possono variare occasionalmente, scrivici o chiamaci prima di venire.",
        class_advance_name: 'Avanzato',
        class_advance_time: 'Sabato, 13:30 – 15:30',
        class_advance_desc: 'Per chi ha completato un corso Intermedio, o è già esperto e vuole approfondire ancora di più.',
        class_intermediate_name: 'Intermedio',
        class_intermediate_time: 'Sabato, 15:30 – 17:30',
        class_intermediate_desc: 'Ideale per chi ha già imparato altrove o ha completato il nostro corso Principianti.',
        class_beginner_name: 'Principianti',
        class_beginner_time: 'Domenica, 14:00 – 16:00',
        class_beginner_desc: 'Ideale per chi parte da zero, sia adolescenti che adulti.',
        directions_btn: 'Indicazioni Stradali',
        services_heading: 'Altri Servizi',
        services_note: 'Oltre ai corsi settimanali, portiamo il Bhangra ai vostri eventi.',
        service_wedding_title: 'Coreografie per Matrimoni',
        service_wedding_body: 'Coreografie di Bhangra su misura per il sangeet o il giorno del matrimonio.',
        service_personal_title: 'Lezioni Private',
        service_personal_body: 'Lezioni individuali o in piccoli gruppi, al tuo ritmo.',
        service_rental_title: 'Noleggio Costumi e Accessori',
        service_rental_body: 'Costumi e accessori tradizionali Bhangra disponibili a noleggio per il tuo evento.',
        service_performances_title: 'Esibizioni per Eventi',
        service_performances_body: 'Ci esibiamo a matrimoni, festival e occasioni private o aziendali.',
        services_cta: 'Chiedi Informazioni',
        events_heading: 'Prossimi Eventi',
        recent_events_heading: 'Eventi Recenti',
        event_castelvetro_title: 'Esibizione dei nostri studenti',
        event_competition_title: 'Gara di Bhangra in studio',
        events_empty_note: 'Nessun evento in programma al momento, seguici per gli aggiornamenti.',
        events_follow_instagram: 'Seguici su Instagram',
        events_follow_whatsapp: 'Scrivici su WhatsApp',
        trial_heading: 'Nuovo Qui? Prova una Lezione Gratis',
        trial_body: 'Ogni nuovo ballerino ha diritto a una lezione dimostrativa gratuita, senza impegno. Scrivici su WhatsApp e organizziamo tutto.',
        trial_btn: 'Prenota la Prova Gratuita',
        videos_heading: 'Guardaci Ballare',
        videos_note: 'I momenti salienti delle nostre lezioni ed esibizioni.',
        videos_empty_note: 'Nuovi video in arrivo, iscriviti per non perderteli.',
        videos_cta: 'Visita il Nostro Canale YouTube',
        videos_follow: 'Seguici:',
        social_ig_heading: 'Seguici su Instagram',
        social_yt_heading: 'Ultimi Video su YouTube',
        ig_empty_note: 'I nostri ultimi reel e le nostre foto sono su Instagram, vieni a trovarci!',
        gallery_heading: 'Galleria',
        gallery_note: 'I momenti salienti delle nostre lezioni ed esibizioni.',
        gallery_empty_note: 'Foto delle nostre lezioni ed esibizioni, in arrivo presto!',
        contact_heading: 'Contattaci',
        nav_reviews: 'Recensioni',
        reviews_heading: 'Cosa Dicono i Nostri Membri',
        reviews_read_all: 'Leggi tutte le recensioni su Google',
        reviews_invite: 'Hai provato le nostre lezioni? Racconta la tua esperienza su Google.',
        reviews_write: 'Scrivi una recensione',
        footer_tagline: 'Una delle migliori scuole di Bhangra in Italia, guidata da un coach esperto del Punjab che rende semplice imparare il Bhangra.',
        footer_quick_links: 'Link Rapidi',
        footer_contact_heading: 'Contatti',
        footer_address_label: 'Via Magazzini Generali, 26100 Cremona CR',
        footer_rights: 'Tutti i diritti riservati.',
        footer_members: 'Area Soci'
    },

    // Romanized Punjabi (Latin script, as typed on phones, NOT Gurmukhi)
    pa: {
        lang_label: 'PU',
        home: 'Home',
        what_would: 'Tusi ki karna chahoge?',
        mark_attendance: '✅ Haazri lagao',
        see_report: '📋 Apni report vekho',
        continue: 'Agge vadho',
        searching: 'Labh rahe haan…',
        phone_placeholder: 'jiven 333 123 4567',
        enter_phone: 'Apna oh mobile number likho jehda saade kol register hai.',
        phone_invalid: 'Poora mobile number likho (ghat ton ghat 9 ank).',
        phone_not_found: 'Eh number nahi labbha. Dubara check karo, ja instructor nu pucho.',
        something_wrong: 'Kujh galat ho gaya. Dubara koshish karo ja instructor nu pucho.',
        who_are_you: 'Tusi kaun ho?',
        pick_self: 'Is number te ikk ton vadh member registered han, apna naam chuno.',
        use_diff_number: '← Koi hor number varto',
        checking_in_pending: '📍 Check-in ho riha hai…',
        branch_confirmed: '📍✓ Tusi saadi Cremona branch te ho',
        branch_default: '📍 Tusi saadi Cremona branch te check-in kar rahe ho',
        closed_heading: 'Check-in hune khulla nahi hai',
        closed_msg: 'Check-in {days} nu khulda hai, {start} - {end}. Odon aayo!',
        not_setup: 'Check-in ajje set nahi hoya. Instructor nu pucho.',
        notify_from_closed: 'Check-in nahi ho riha? Instructor nu daso',
        too_far_heading: 'Tusi studio ton door lagde ho',
        too_far_body: 'Tuhade phone di location mutabik tusi Bhangra Sway Cremona ton 500m ton vadh door ho, is layi self check-in band hai. Ho sakda browser ne location theek share nahi kiti, tusi instructor nu das sakde ho.',
        loc_unknown_heading: 'Asi tuhadi location verify nahi kar sake',
        loc_unknown_body: 'Self check-in layi phone di location zaroori hai taan ki pata lage tusi studio vich ho. Location on karke fer try karo — ja request bhejo, tuhada instructor tuhanu present mark kar dega.',
        retry_location: 'Location on kar ditti — fer try karo',
        request_attendance: 'Haazri di request bhejo',
        mark_yourself: 'Apni haazri lagao',
        notify_heading: 'Instructor nu daso',
        enter_phone_notify: 'Apna register hoya mobile number likho, instructor tuhadi haazri khud lagauga.',
        greeting: 'Sat Sri Akal, {name} 👋',
        ready_to_mark: 'Ajj di haazri pakki kariye?',
        send_request_q: 'Request bhejiye taan jo instructor tuhadi haazri khud lagave?',
        confirm_checkin: 'Haazri pakki karo',
        send_to_instructor: 'Instructor nu bhejo',
        not_you: 'Tusi nahi? Koi hor number varto',
        checking_in_btn: 'Haazri lag rahi hai…',
        sending: 'Bhej rahe haan…',
        checked_in_title: 'Tuhadi haazri lag gayi!',
        see_you_in_class: 'Class vich milange, {name}.',
        already_title: 'Haazri pehlan hi lagi hai',
        already_sub: '{name}, ajj tuhadi haazri pehlan hi lagi hoyi hai.',
        already_marked_sub: '{name}, ajj di tuhadi haazri pehlan hi lagi hoyi si.',
        instructor_notified: 'Instructor nu das ditta',
        will_mark_manually: '{name}, tuhada instructor tuhadi haazri khud lagauga.',
        notify_failed: 'Message nahi bhej sake',
        try_again_or_ask: 'Dubara koshish karo, ja sidha instructor nu pucho.',
        checkin_someone_else: 'Kise hor di haazri lagao',
        day_0: 'Aitvaar', day_1: 'Somvaar', day_2: 'Mangalvaar', day_3: 'Budhvaar',
        day_4: 'Veervaar', day_5: 'Shukkarvaar', day_6: 'Shanivaar',
        error_heading: 'Kujh galat ho gaya',
        view_report: 'Apni report vekho',
        report_hi: 'Sat Sri Akal,',
        progress_intro: 'Eh hai tuhadi Bhangra progress report.',
        attendance_heading: '📅 Haazri (pichhle 2 mahine)',
        classes_attended_suffix: 'classes lagiyan',
        no_attendance: 'Koi haazri record nahi',
        launch_note: 'ℹ️ June 2026 ton pehlan diyan classes ethe record nahi han.',
        membership_heading: '💳 Membership Status',
        guarantee_note: 'ℹ️ Fikar na karo, har cycle vich 4 classes pakkiyan han. Je kujh reh jaan, plan aap hi vadhda hai (2 mahine takk) jadon takk 4 puriyan na hon.',
        current_cycle: 'Chalda cycle',
        previous_cycle: 'Pichhla cycle',
        badge_paid: '🟢 Chalu / Bharia hoya',
        badge_overdue: '🔴 Fees late han',
        badge_unpaid: '🟡 Payment baaki hai',
        month_one: 'mahine', month_many: 'mahine',
        overdue_note: '🔴 Tuhade {months} de paise baaki han (€{amount}), kirpa karke jaldi fees bharo.',
        extended_tag: '⏳ vadhaya gaya',
        pill_paid: '✅ Bharia',
        pill_unpaid: '❌ Baaki',
        classes_progress: '{a}/{b} classes lagiyan',
        extra_gifted_one: ', {n} extra class tohfe vich! 🎁',
        extra_gifted_many: ', {n} extra classes tohfe vich! 🎁',
        carried_note: ' ({n} pichhle cycle ton naal aiyan)',
        starts_first_class: 'Tuhadi pehli class ton shuru hovega',
        demo_taken_pill: '🎁 Demo layi',
        na: 'N/A',
        demo_note: '🎁 Demo class layi gayi, tuhada plan agli attend kiti class ton shuru hovega.',
        paused_note: '⏸ Tuhada plan pause hai, jadon tusi vapas aaoge, {a}/{b} classes naal jud jangiyan.',
        more_classes_one: '{n} hor class',
        more_classes_many: '{n} hor classes',
        ext_note_paid: '⏳ Koi kaahli nahi, is cycle vich tusi {a}/{b} classes te ho. Eh {left} ja {date} ton baad pura hovega (je tusi nahi aunde taan dates aap hi vadh jandiyan han).',
        ext_note_unpaid: '⏳ Tuhada plan cycle {left} ja {date} ton baad badlega (dates aap hi vadh jandiyan han), tuhadi payment baaki hai, kirpa karke jaldi bharo.',
        payments_heading: '💶 Payments',
        last_payment: 'Aakhri payment',
        total_pending: 'Kull baaki',
        no_payments: 'Ajje koi payment nahi',
        cycles_unpaid_one: '{n} cycle baaki',
        cycles_unpaid_many: '{n} cycle baaki',
        caught_up: 'Sab clear hai! 🎉',
        next_payment_note: '🎉 Vadhaiyan! Tuhadi agli payment {date} ton baad banegi, ja {left} attend karan ton baad ({a}/{b} is cycle vich hun takk), jehda pehlan aave.',
        advance_paid_note_one: '🎉 Vadhiya khabar! Tuhada agla cycle pehlan hi advance vich paid hai — hun hor kujh nahi dena. Agli payment shayad {date} ton baad banegi je tusi regular aande ho (nahi taan aap hi extend ho jandi hai).',
        advance_paid_note_many: '🎉 Vadhiya khabar! Tuhade agle {n} cycle pehlan hi advance vich paid han — hun hor kujh nahi dena. Agli payment shayad {date} ton baad banegi je tusi regular aande ho (nahi taan aap hi extend ho jandi hai).',
        someone_else_report: 'Kise hor di report vekho',
        verify_failed: 'Asi tuhanu verify nahi kar sake, instructor nu pucho.',
        report_load_failed: 'Report load nahi hoi ({err}). Dubara koshish karo.',

        // Public marketing homepage (index.html)
        nav_classes: 'Classes',
        nav_services: 'Services',
        nav_events: 'Events',
        nav_trial: 'Free Trial',
        nav_videos: 'Videos',
        nav_gallery: 'Gallery',
        nav_contact: 'Contact',
        nav_members: 'Members',
        nav_media: 'Media',
        tt_follow_btn: 'TikTok te sanu follow karo',
        fb_like_btn: 'Facebook te saada page like karo',
        hero_tagline: 'Punjab da Josh, Cremona vich',
        about_heading: 'Saade Baare',
        about_body: 'Bhangra Sway Cremona Baccheaan, Waddheaan, Naveyaan te tajurbekaar dancers, Punjabi community, Italian Community te hor v Bhangre te Punjabi Culture nu pyar karan wale har kise da sawagat karde haan. Shuru karan lyi kise Tajurbe di lorh nahi.',
        classes_heading: 'Saadiyan Classes',
        classes_note: 'Timing kadi kadi badal sakdi hai, auan ton pehlan message ja call zaroor karo.',
        class_advance_name: 'Advance',
        class_advance_time: 'Saturday, 1:30 PM – 3:30 PM',
        class_advance_desc: 'Ohna layi jo students intermediate batch pass kar chukke ne ya fer pehla hi pro ne te hor depth vich sikhna chahunde ne.',
        class_intermediate_name: 'Intermediate',
        class_intermediate_time: 'Saturday, 3:30 PM – 5:30 PM',
        class_intermediate_desc: 'Ohna layi jinhan ne kitte hor sikhya hove ja saadi Beginner class pass keeti hove.',
        class_beginner_name: 'Beginner',
        class_beginner_time: 'Sunday, 2:00 PM – 4:00 PM',
        class_beginner_desc: 'Bilkul zero level layi best — chahe teenager ho ja adult, koi tajurbe di lorh nahi.',
        directions_btn: 'Raah Dasso',
        services_heading: 'Hor Services',
        services_note: 'Weekly classes tho ilava, asi Bhangra tuhade events te vi lyi aunde haan.',
        service_wedding_title: 'Wedding Choreography',
        service_wedding_body: 'Tuhade sangeet ja wedding din lyi custom Bhangra choreography.',
        service_personal_title: 'Personal Classes',
        service_personal_body: 'One-on-one ja small-group private lessons, tuhadi apni speed te.',
        service_rental_title: 'Props te Dresses Rental',
        service_rental_body: 'Traditional Bhangra props te outfits tuhade event lyi rent te available han.',
        service_performances_title: 'Event Performances',
        service_performances_body: 'Asi weddings, festivals, te personal ja official occasions te perform karde haan.',
        services_cta: 'Is Baare Puchho',
        events_heading: 'Aunde Events',
        recent_events_heading: 'Pichhle Events',
        event_castelvetro_title: 'Sade students di performance',
        event_competition_title: 'Studio vich Bhangra competition',
        events_empty_note: 'Hun koi event scheduled nahi hai, updates lyi saanu follow karo.',
        events_follow_instagram: 'Instagram te Follow Karo',
        events_follow_whatsapp: 'WhatsApp te Puchho',
        trial_heading: 'Nave Ho? Ikk Free Class Try Karo',
        trial_body: 'Har nave dancer nu ikk free demo class mildi hai, koi shart nahi. WhatsApp te message karo, asi sab set kar dvange.',
        trial_btn: 'Free Trial Book Karo',
        videos_heading: 'Sadia Peshkaaria Dekho',
        videos_note: 'Saadiyan classes te performances de highlights.',
        videos_empty_note: 'Naviyan videos jaldi aa rahiyan han, subscribe karo taan ki miss na hovan.',
        videos_cta: 'Saada YouTube Channel Dekho',
        videos_follow: 'Saanu follow karo:',
        social_ig_heading: 'Instagram te Saanu Follow Karo',
        social_yt_heading: 'Naviyan YouTube Videos',
        ig_empty_note: 'Saade naveen reels te photos Instagram te han, aa ke milo!',
        gallery_heading: 'Gallery',
        gallery_note: 'Saadiyan classes te performances de highlights.',
        gallery_empty_note: 'Saadiyan classes te performances diyan photos, jaldi aa rahiyan han!',
        contact_heading: 'Sampark Karo',
        nav_reviews: 'Reviews',
        reviews_heading: 'Sade Members Ki Kehnde Han',
        reviews_read_all: 'Sare reviews Google te parho',
        reviews_invite: 'Sadiyan classes try kitiyan han? Apna tajurba Google te share karo.',
        reviews_write: 'Apna review likho',
        footer_tagline: 'Italy de sab ton vadhiya Bhangra studios cho ikk — Punjab de tajurbekar coach de naal, jo bhangra sikkhna bahut asaan banaa dinde hann.',
        footer_quick_links: 'Quick Links',
        footer_contact_heading: 'Contact',
        footer_address_label: 'Via Magazzini Generali, 26100 Cremona CR',
        footer_rights: 'Sare hakk surakhiat han.',
        footer_members: 'Members Login'
    }
};

// Flag icons for the language dropdown, drawn inline as SVG: emoji flags
// render as plain letters on Windows, and Punjab has no emoji flag at all ,
// its icon is the yellow state-map sticker with "PUNJAB" lettered across it.
const I18N_FLAGS = {
    // English, the Union Jack (more recognizable at small size than
    // England's St George's Cross, which reads as the Swiss flag to many)
    en: '<svg class="lang-flag" viewBox="0 0 30 20" aria-hidden="true">' +
        '<rect width="30" height="20" fill="#012169"/>' +
        '<path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" stroke-width="4"/>' +
        '<path d="M0 0 L30 20 M30 0 L0 20" stroke="#C8102E" stroke-width="1.6"/>' +
        '<path d="M15 0 v20 M0 10 h30" stroke="#fff" stroke-width="6.6"/>' +
        '<path d="M15 0 v20 M0 10 h30" stroke="#C8102E" stroke-width="4"/>' +
        '</svg>',
    // Italy, il Tricolore
    it: '<svg class="lang-flag" viewBox="0 0 30 20" aria-hidden="true">' +
        '<rect width="10" height="20" fill="#009246"/>' +
        '<rect x="10" width="10" height="20" fill="#fff"/>' +
        '<rect x="20" width="10" height="20" fill="#ce2b37"/>' +
        '</svg>',
    // Punjab, the real state boundary (simplified from geohacker/india's
    // open GeoJSON), styled like the studio's sticker: yellow fill, black
    // outline, PUNJAB lettered across the widest part of the state
    pa: '<svg class="lang-flag lang-flag-map" viewBox="0 0 100 100" aria-hidden="true">' +
        '<path fill="#ffe600" stroke="#111" stroke-width="3" stroke-linejoin="round" d="' +
        'M62.2 6.7 L63.8 8.8 L61.5 10 L58.7 13.2 L55.8 14.4 L55.7 15.9 L56.8 16.5 L54.6 19 L57.5 19' +
        '.6 L60 21.7 L62.8 23 L64.8 27 L63.5 27 L65.7 32.2 L69.6 39.3 L69.1 40.9 L69.9 41.5 L70.1 4' +
        '2.5 L73.3 42.2 L73.3 41.5 L74.4 41.1 L73.8 39.6 L74.9 39.2 L75 38.5 L77.3 42.6 L76.8 43.3 ' +
        'L77.7 42.4 L79.1 43.9 L79.6 43.2 L79.5 44.1 L80.4 43.4 L81.3 44.2 L80.7 45.3 L81.9 45 L82.' +
        '1 45.4 L81 46.3 L80.9 48 L81.9 48.5 L81.2 50.2 L81.5 51.7 L84.2 53 L87.6 58.2 L87.2 59 L86' +
        '.5 59.1 L86.4 58.4 L85.9 58.7 L85.2 58 L83.6 59.5 L84.8 61.3 L86.3 61.9 L86.9 61.4 L87.3 6' +
        '2.3 L88.1 61.6 L88 62.8 L89.4 64 L88.6 65.8 L89.6 66.5 L88.7 67.5 L88.7 68.8 L89.8 70.3 L8' +
        '8.5 71.3 L88.5 70.5 L87.3 69 L86.6 69.7 L85.3 68.9 L83.8 70.3 L84.1 71.1 L84.8 71.3 L84.2 ' +
        '72.1 L83.2 72.3 L81.5 74 L79.9 74.2 L79.5 75.3 L80.8 74.4 L81.5 75.2 L81.3 75.7 L82.2 76 L' +
        '81.9 79 L81.2 79.8 L80.6 79.9 L80 79.2 L78.6 79.9 L78.4 79.3 L77.4 79.2 L76.3 76.1 L75.5 7' +
        '6.7 L76.1 77.4 L75.7 78.3 L74.1 77.7 L74.7 78.3 L74 78.9 L72.1 78.6 L70.9 77.4 L71.1 78.1 ' +
        'L70.6 78.1 L72.2 79 L70.8 81.1 L71.2 81.4 L70.6 81.7 L70.9 83.9 L69.9 84.4 L70.4 85.6 L71.' +
        '9 86.2 L68.6 88.4 L67.6 88.1 L66.5 89.9 L66 89.6 L64.7 90.4 L62.4 89.9 L61.1 87.9 L60.3 88' +
        '.1 L59.6 87.5 L57.9 88 L57.7 89.7 L55.8 89.1 L55.5 89.9 L54.4 90 L54 89.3 L52.9 89.5 L51.1' +
        ' 88.1 L49.4 91 L48.3 91.5 L48.7 92.6 L47.8 92.2 L46.8 94.1 L47.5 94.7 L47.2 95.3 L45.4 96 ' +
        'L45.3 94.2 L44 93.5 L43.6 92.5 L45.6 89.7 L44.7 88.4 L44.8 87.4 L44.3 87.1 L43.6 87.7 L43.' +
        '7 88.8 L43.2 89 L42.8 88.1 L41.9 88.1 L42.3 87.5 L41.7 86.8 L42.2 86.1 L41.7 84.8 L41.2 85' +
        '.9 L39.3 86.6 L38.4 85.3 L37.3 83.8 L36.5 84.1 L36.4 83.2 L35.6 83.5 L34.4 82.4 L32.3 83.4' +
        ' L31.5 83.2 L30.1 85.1 L27.1 83.7 L10.6 83.1 L10.4 81.9 L12.6 78.5 L12.6 76.6 L12.4 74.3 L' +
        '10.2 70.6 L11.6 69.4 L11.8 68.2 L12.5 68.3 L13.2 66.9 L14.4 65.9 L15.5 66.1 L15.9 63.6 L16' +
        '.3 63.8 L16.6 63 L17.4 63 L19.5 60.4 L20.8 60 L20.3 58.9 L21.2 58.5 L20.9 57.9 L21.7 56.5 ' +
        'L22.9 56.5 L23 55.3 L27.5 52.1 L28 49.8 L29.1 50.5 L31.3 49.7 L31.6 48.9 L31.1 47.9 L29 47' +
        '.8 L29 49.1 L28.2 49.3 L27.7 49.2 L27.6 48.1 L26.6 47.7 L26.8 43.6 L27.9 42.8 L30.2 37.9 L' +
        '29.8 37.1 L28.2 36.7 L29.2 35.6 L29.1 34.6 L27 29.9 L27 29.2 L27.9 29 L28 26.7 L29.1 25 L3' +
        '1.8 23.8 L32 22.8 L32.7 23.4 L34.6 22.9 L34.8 21.6 L36 20.8 L35.9 20.1 L37.3 19.5 L39.7 20' +
        '.6 L42.6 19 L43.8 19.4 L44.6 18 L45.8 18.8 L47.7 16.7 L48.2 15.3 L47.7 15 L49 14.4 L49.1 1' +
        '3.3 L48.4 12.7 L48 11.1 L50.3 11.6 L51.8 11.2 L52.5 13.1 L53.3 10.9 L58.1 8.8 L59 7 L60.5 ' +
        '6.7 L62.3 4 L61.7 5.7 Z' +
        '"/>' +
        '<text x="53" y="61" text-anchor="middle" fill="#111" font-family="Arial, sans-serif"' +
        ' font-size="14" font-weight="900" letter-spacing="0.5">PUNJAB</text>' +
        '</svg>'
};

// Full language names for the dropdown menu (the closed pill shows only the
// flag, no text code).
const I18N_LANG_NAMES = { en: 'English', it: 'Italiano', pa: 'Punjabi' };

// All dropdown + flag styling lives here so every page that drops in a
// #langPicker gets it without touching its own CSS.
const I18N_FLAG_CSS =
    '.lang-flag { width: 18px; height: 12px; border-radius: 2px; display: block;' +
    ' box-shadow: 0 0 0 1px rgba(0,0,0,0.15); flex-shrink: 0; }' +
    '.lang-flag-map { width: 18px; height: 18px; border-radius: 0; box-shadow: none; }' +
    // The closed pill shows no text, so its flag is a touch bigger for tapping
    '.lang-dd-toggle .lang-flag { width: 23px; height: 15px; }' +
    '.lang-dd-toggle .lang-flag-map { width: 21px; height: 21px; }' +
    '.lang-dropdown { position: relative; }' +
    '.lang-dd-toggle { display: inline-flex; align-items: center; gap: 6px;' +
    ' background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.45);' +
    ' color: #fff; font-weight: 700; font-size: 0.78em; padding: 6px 10px;' +
    ' border-radius: 999px; cursor: pointer; font-family: inherit; }' +
    '.lang-dd-caret { font-size: 0.8em; line-height: 1; }' +
    '.lang-dd-menu { position: absolute; right: 0; top: calc(100% + 6px);' +
    ' background: #fff; border-radius: 12px; box-shadow: 0 10px 28px rgba(0,0,0,0.3);' +
    ' padding: 6px; min-width: 150px; z-index: 50; }' +
    '.lang-dd-menu.hidden { display: none; }' +
    '.lang-dd-item { display: flex; align-items: center; gap: 9px; width: 100%;' +
    ' padding: 9px 11px; border: none; background: none; border-radius: 8px;' +
    ' cursor: pointer; font-family: inherit; font-size: 0.9em; font-weight: 600;' +
    ' color: #2c3e50; text-align: left; }' +
    '.lang-dd-item:hover { background: #f4f5fc; }' +
    '.lang-dd-item.active { background: #eef2ff; color: #5b3fa0; }';

const I18N_STORAGE_KEY = 'bs_lang';

let currentLang = (() => {
    try {
        const saved = localStorage.getItem(I18N_STORAGE_KEY);
        return I18N[saved] ? saved : 'en';
    } catch { return 'en'; }
})();

function t(key, vars) {
    let s = (I18N[currentLang] && I18N[currentLang][key]) ?? I18N.en[key] ?? key;
    if (vars) {
        Object.keys(vars).forEach((k) => {
            s = s.split('{' + k + '}').join(String(vars[k]));
        });
    }
    return s;
}

// "{n} thing/things" with the right plural form for the current language.
function tCount(n, oneKey, manyKey) {
    return t(n === 1 ? oneKey : manyKey, { n });
}

function tDay(i) {
    return t('day_' + i);
}

function applyI18n() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        // A key this file doesn't know (e.g. the page is newer than a
        // browser-cached copy of this script) keeps the element's own
        // default text instead of printing the raw key name.
        const key = el.dataset.i18n;
        if ((I18N[currentLang] && I18N[currentLang][key]) ?? I18N.en[key]) {
            el.textContent = t(key);
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.dataset.i18nPlaceholder;
        if ((I18N[currentLang] && I18N[currentLang][key]) ?? I18N.en[key]) {
            el.placeholder = t(key);
        }
    });
    // The closed pill is flag-only (plus a caret), no EN/IT/PU text.
    const toggle = document.querySelector('#langPicker .lang-dd-toggle');
    if (toggle) {
        toggle.innerHTML = (I18N_FLAGS[currentLang] || '') +
            '<span class="lang-dd-caret">▾</span>';
        toggle.setAttribute('aria-label', I18N_LANG_NAMES[currentLang] || currentLang);
    }
    document.querySelectorAll('#langPicker .lang-dd-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.lang === currentLang);
    });
}

function setLang(code) {
    if (!I18N[code] || code === currentLang) return;
    currentLang = code;
    try { localStorage.setItem(I18N_STORAGE_KEY, code); } catch {}
    applyI18n();
    if (typeof window.onLangChange === 'function') window.onLangChange();
}

document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('langPicker');
    if (picker) {
        const style = document.createElement('style');
        style.textContent = I18N_FLAG_CSS;
        document.head.appendChild(style);

        const dropdown = document.createElement('div');
        dropdown.className = 'lang-dropdown';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'lang-dd-toggle';

        const menu = document.createElement('div');
        menu.className = 'lang-dd-menu hidden';

        Object.keys(I18N).forEach((code) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'lang-dd-item';
            item.dataset.lang = code;
            item.innerHTML = (I18N_FLAGS[code] || '') +
                '<span>' + (I18N_LANG_NAMES[code] || I18N[code].lang_label) + '</span>';
            item.addEventListener('click', () => {
                setLang(code);
                menu.classList.add('hidden');
            });
            menu.appendChild(item);
        });

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });
        // Any click outside the dropdown (or an Escape press) closes it.
        document.addEventListener('click', () => menu.classList.add('hidden'));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') menu.classList.add('hidden');
        });
        menu.addEventListener('click', (e) => e.stopPropagation());

        dropdown.appendChild(toggle);
        dropdown.appendChild(menu);
        picker.appendChild(dropdown);
    }
    applyI18n();
});
