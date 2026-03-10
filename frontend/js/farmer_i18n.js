/* =========================================================
   FILE: /public/js/farmer/farmer_i18n.js
   PURPOSE: Centralized farmer module translations
========================================================= */

const DEFAULT_LANG = "en";

export const farmerTranslations = {
  en: {
    /* =========================
       GLOBAL / COMMON
    ========================= */
    settings: "Settings",
    logout: "Logout",
    language: "Language",
    save: "Save",
    reset: "Reset",
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    back_to_cycles: "Back to Cycles",
    open: "Open",
    view: "View",
    apply: "Apply",
    all: "All",
    status: "Status",
    health: "Health",
    sex: "Sex",
    male: "Male",
    female: "Female",
    total: "Total",
    alive: "Alive",
    dead: "Dead",
    healthy: "Healthy",
    sick: "Sick",
    native: "Native",
    email: "Email",
    name: "Name",
    address: "Address",
    today: "Today",
    month: "Month",
    list: "List",
    page_default: "Page 1 / 1",
    prev: "Prev",
    next: "Next",

    /* =========================
       ALERTS / SYSTEM TEXT
    ========================= */
    logout_confirm: "Logout?",
    settings_saved: "Settings saved",
    settings_reset: "Settings reset",
    video_limit_error: "Video must be 350MB or less",

    /* =========================
       NAV / DASHBOARD
    ========================= */
    dashboard: "Dashboard",
    dashboard_title: "DASHBOARD",
    hello_user: "Hello, {{name}}",
    my_pigs: "MY PIGS",
    report: "REPORT",
    schedule: "SCHEDULE",
    reproduction_monitoring: "REPRODUCTION MONITORING",
    analytics: "ANALYTICS",
    profile: "PROFILE",
    help: "HELP",

    /* =========================
       NOTIFICATIONS
    ========================= */
    notifications: "Notifications",
    latest_updates: "Latest updates",
    mark_all: "Mark all",
    view_all_notifications: "View All Notifications",
    notification_history: "Notification History",
    all_notifications: "All notifications",
    type: "Type",
    time: "Time",
    all_types: "All Types",
    info: "Info",
    success: "Success",
    warning: "Warning",
    any_time: "Any time",
    last_7_days: "Last 7 days",
    last_30_days: "Last 30 days",

    /* =========================
       HELP PAGE
    ========================= */
    need_help: "Need Help?",
    find_guides_answers_support: "Find guides, answers and support quickly.",
    help_support: "Help & Support",
    video_tutorials: "Video Tutorials",
    step_by_step_walkthroughs: "Step-by-step walkthroughs",
    faq: "Frequently Asked Questions",
    quick_answers_and_fixes: "Quick answers and fixes",
    support: "Support",
    submit_ticket_and_track_status: "Submit a ticket and track status",

    /* =========================
       HELP MODAL
    ========================= */
    guides_common_fixes_ticket_submission: "Guides, common fixes, and ticket submission",
    quick_guide: "Quick Guide",
    sidebar: "Sidebar",
    use_left_navigation_to_switch_modules: "Use the left navigation to switch modules.",
    click_bell_to_view_alerts_and_history: "Click the bell to view alerts and history.",
    account_settings: "Account Settings",
    update_profile_and_password: "Update your profile and password.",
    data_safety: "Data Safety",
    avoid_refreshing_during_uploads: "Avoid refreshing during file uploads.",
    common_issues: "Common Issues",
    page_disappeared_stuck_scroll: "“Page disappeared” / stuck scroll",
    close_open_modal_then_refresh: "Close any open modal/offcanvas, then refresh the page.",
    upload_not_showing: "Upload not showing",
    confirm_file_type_size_keep_internet_stable: "Confirm file type/size and keep the internet stable during upload.",
    session_expired: "Session expired",
    login_again_if_inactive: "Login again if you were inactive for a while.",
    support_email: "Support Email",
    submit_support_ticket: "Submit a Support Ticket",
    ticket_history: "Ticket History",
    category: "Category",
    priority: "Priority",
    select_category: "Select category",
    normal: "Normal",
    priority_set_automatically: "Priority is set automatically based on the category.",
    subject: "Subject",
    short_summary_placeholder: "Short summary (e.g., cannot upload profile photo)",
    message: "Message",
    describe_issue_placeholder: "Describe the issue. Include steps to reproduce if possible.",
    tip_include_page_and_button: "Tip: include what page you were on and what button you clicked.",
    submit_ticket: "Submit Ticket",

    /* =========================
       MY PIGS
    ========================= */
    my_pigs_title: "My Pigs",
    manage_livestock_efficiently: "Manage your livestock efficiently",
    search_by_tag_id: "Search by Tag ID...",
    piglets: "Piglets",
    sows: "Sows",
    boars: "Boars",

    /* =========================
       REPORT - HEAT MONITORING
    ========================= */
    report_heat_monitoring: "REPORT - HEAT MONITORING",
    track_breeding_cycle_pregnancy: "Track breeding cycle & pregnancy progress",
    logs: "LOGS",
    create_report: "CREATE REPORT",
    archive: "ARCHIVE",
    open_sows: "OPEN SOWS",
    in_heat: "IN-HEAT",
    under_observation: "UNDER OBSERVATION",
    pregnant: "PREGNANT",
    farrowing: "FARROWING",
    lactating: "LACTATING",
    approved: "Approved",
    rejected: "Rejected",
    search_tag: "Search tag...",
    next_check: "NEXT CHECK",
    current_stage: "CURRENT STAGE",
    days_remaining_25: "25 days remaining",
    overdue_days_2: "Overdue (2 days ago)",
    view_details: "View Details",
    track_progress: "Track Progress",
    active_cycle: "Active Cycle",
    ai_scheduled: "AI Scheduled",

    /* =========================
       SCHEDULE PAGE
    ========================= */
    breeding_farrowing_schedule: "Breeding & Farrowing Schedule",
    monitor_ai_rechecks_farrowing_weaning: "Monitor Artificial Insemination, Heat Re-checks, Farrowing & Weaning",
    tap_date_preview_tasks: "Tap a date to preview tasks and actions on the right panel.",
    calendar_view: "Calendar View",
    tasks: "Tasks",
    no_scheduled_activities: "No scheduled activities.",
    farrowed: "Farrowed",
    weaned: "Weaned",
    ai_due: "AI Due",
    plus_more: "+1 more",

    /* =========================
       REPRODUCTION MONITORING
    ========================= */
    hi_farmer: "Hi! Farmer",
    reproduction_monitoring_title: "Reproduction Monitoring",
    track_sow_cycles_monitor_piglets: "Track sow cycles, monitor piglets, review performance, and finalize selection.",
    filters: "Filters",
    search_by_sow_tag_or_pig_id: "Search by sow tag/pig ID and narrow down by status.",
    tag_or_pig_id: "Tag / Pig ID...",
    all_status: "All Status",
    tip_try_pregnant_lactating_tag: "Tip: Try “pregnant”, “lactating”, or a sow tag.",
    sows_title: "Sows",
    tap_view_to_open_sow_details: "Tap View to open the sow details panel.",
    last_ai: "Last AI",
    piglets_count: "Piglets",

    /* =========================
       SOW DETAILS / OVERVIEW
    ========================= */
    sow: "Sow",
    overview_cycles_piglets_selection: "Overview, cycles, piglets, selection",
    breed: "Breed",
    dob: "DOB",
    female_label: "Female",
    male_label: "Male",
    overview: "Overview",
    reproduction: "Reproduction",
    latest_measurements: "Latest Measurements",
    last_record: "Last record",
    weight: "Weight",
    body_length: "Body Length",
    heart_girth: "Heart Girth",
    teat_count: "Teat Count",
    teeth: "Teeth",
    measurements_pulled_from_latest_record: "Measurements are pulled from the latest performance_records entry (if available).",
    piglet_summary: "Piglet Summary",
    quick_actions: "Quick Actions",
    view_cycles: "View Cycles",
    selection_process: "Selection Process",
    use_reproduction_tab_to_manage: "Use the Reproduction tab to open a cycle and manage piglets.",

    /* =========================
       REPRODUCTION TAB / CYCLES
    ========================= */
    cycles: "Cycles",
    choose_cycle_to_view_records: "Choose a cycle to view records.",
    cycle: "Cycle",
    all_cycles: "All cycles",
    cycle_1: "Cycle 1",
    service_date: "Service Date",
    boar: "Boar",
    open_cycle: "Open Cycle",
    page_of_cycles: "Page {{page}} of {{total}} • {{count}} cycles",

    /* =========================
       CYCLE DETAILS / TABS
    ========================= */
    cycle_details: "Cycle Details",
    ai_record_performance_growth_selection: "AI record • performance • growth • selection",
    artificial_insemination_record: "Artificial Insemination Record",
    breeding_performance: "Breeding Performance",
    growth_monitoring: "Growth Monitoring",

    /* =========================
       AI RECORD TAB
    ========================= */
    sow_label: "Sow",
    ai_service_date: "AI Service Date",
    cycle_status: "Cycle Status",
    ai_record_id: "AI Record ID",
    service_details: "Service Details",
    boar_sire_tag_code: "Boar (Sire Tag / Code)",
    pregnancy_confirmed: "Pregnancy Confirmed",
    expected_farrowing: "Expected Farrowing",
    not_available: "N/A",

    /* =========================
       BREEDING PERFORMANCE TAB
    ========================= */
    alive_male: "Alive Male",
    alive_female: "Alive Female",
    deceased: "Deceased",
    male_piglet: "Male • piglet",
    female_piglet: "Female • piglet",

    /* =========================
       GROWTH MONITORING TAB
    ========================= */
    filter_piglets_open_chart: "Filter piglets, then open one to view chart and deformities.",
    sex_filter: "Sex Filter",
    filter_piglets_by_tag_or_stage: "Filter piglets by tag or stage...",
    suckling: "Suckling",
    weight_trend: "Weight Trend",
    auto_updated_morphology: "Auto-updated based on recorded morphology entries",
    entries: "Entries",
    monitoring_summary: "Monitoring Summary",
    current_growth_phase_readiness: "Current piglet growth phase and readiness details",
    monitoring_phase: "Monitoring Phase",
    age_in_days: "Age in Days",
    days_remaining: "Days Remaining",
    selection_eligibility: "Selection Eligibility",
    not_yet: "Not Yet",
    deformities: "Deformities",
    no_deformities_found: "No deformities found.",

    /* =========================
       SELECTION PROCESS TAB
    ========================= */
    filter_piglets_open_selection: "Filter piglets, then open one to view selection status and actions.",
    retain: "Retain",
    for_sale: "For Sale",
    pending: "Pending",
    decision_filter: "Decision Filter",
    mark_as_culled_sale: "Mark as Culled/Sale",
    system_suggestion_continue_monitoring: "System Suggestion: Continue monitoring and record growth updates.",

    /* =========================
       SELECTION DETAILS
    ========================= */
    selection_details: "Selection Details",
    status_suggestion_actions: "Status, suggestion, and actions",
    stage_monitoring_day_1_30: "Stage: Monitoring (Day 1-30)",
    last_update: "Last update",
    final_selection_allowed_after_weaning: "Final selection actions are only allowed after weaning / final selection stage.",
    system_suggestion_pending_insufficient: "System Suggestion: Pending (insufficient records).",
    actions_update_selection_status: "Actions update selection status for this piglet.",
    note_piglet_not_eligible: "Note: This piglet is not eligible yet (stage must be weaned / final selection).",
    sell: "Sell",

    /* =========================
       BREED QUALITY ANALYTICS
    ========================= */
    swine_breed_quality_analysis: "Swine Breed Quality Analysis",
    rankings_and_compatibility_insights: "Rankings and breeding compatibility insights based on performance, traits, and reproductive history.",
    search_swine_id: "Search Swine ID...",
    tip_filter_by_swine_id_then_sex: "Tip: filter quickly by Swine ID, then refine with Sex chips below.",
    breed_quality_rankings: "Breed Quality Rankings",
    quick_scan_best_candidates: "Quick scan of your best candidates for breeding selection.",
    high: "High",
    medium: "Medium",
    low: "Low",
    stage: "Stage",
    age: "Age",
    length: "Length",
    girth: "Girth",
    quality_index: "Quality Index",
    breeding_compatibility_checker: "Breeding Compatibility Checker",
    analyze_compatibility_minimize_inbreeding: "Analyze compatibility between a pair to minimize inbreeding risk.",
    top_recommended_matches: "Top Recommended Matches",
    based_on_best_matches_top_quality: "Based on best matches among top quality adult sows and boars.",
    identifying_best_matches: "Identifying best matches...",
    sow_female: "Sow (Female)",
    select_your_sow: "-- Select Your Sow --",
    boar_male: "Boar (Male)",
    select_your_boar: "-- Select Your Boar --",
    run_compatibility_analysis: "Run Compatibility Analysis",
    adult: "adult",

    /* =========================
       PROFILE
    ========================= */
    pig_farmer: "Pig Farmer",
    account_profile: "Account Profile",
    profile_details: "Profile Details",
    review_account_information: "Review your account information.",
    farmer_id: "Farmer ID",
    contact_number: "Contact Number",
    number_of_pens: "Number of Pens",
    pen_capacity: "Pen Capacity",
    edit_profile: "Edit Profile",

    /* =========================
       EDIT PROFILE
    ========================= */
    update_contact_details_and_capacity: "Update contact details and farm capacity.",
    change_photo: "Change Photo",
    jpg_png_recommended: "JPG/PNG recommended. Square images look best.",
    change_password: "Change Password"
  },

  tl: {
    /* =========================
       GLOBAL / COMMON
    ========================= */
    settings: "Mga Setting",
    logout: "Mag-logout",
    language: "Wika",
    save: "I-save",
    reset: "I-reset",
    cancel: "Kanselahin",
    close: "Isara",
    back: "Bumalik",
    back_to_cycles: "Bumalik sa mga Cycle",
    open: "Buksan",
    view: "Tingnan",
    apply: "Ilapat",
    all: "Lahat",
    status: "Katayuan",
    health: "Kalusugan",
    sex: "Kasarian",
    male: "Lalaki",
    female: "Babae",
    total: "Kabuuan",
    alive: "Buhay",
    dead: "Patay",
    healthy: "Malusog",
    sick: "May Sakit",
    native: "Native",
    email: "Email",
    name: "Pangalan",
    address: "Tirahan",
    today: "Ngayon",
    month: "Buwan",
    list: "Listahan",
    page_default: "Pahina 1 / 1",
    prev: "Nakaraan",
    next: "Susunod",

    /* =========================
       ALERTS / SYSTEM TEXT
    ========================= */
    logout_confirm: "Mag-logout?",
    settings_saved: "Naisave ang settings",
    settings_reset: "Nareset ang settings",
    video_limit_error: "Ang video ay dapat 350MB o mas mababa",

    /* =========================
       NAV / DASHBOARD
    ========================= */
    dashboard: "Dashboard",
    dashboard_title: "DASHBOARD",
    hello_user: "Kamusta, {{name}}",
    my_pigs: "MGA BABOY KO",
    report: "ULAT",
    schedule: "ISKEDYUL",
    reproduction_monitoring: "PAGSUBAYBAY SA REPRODUCTION",
    analytics: "PAGSUSURI",
    profile: "PROFILE",
    help: "TULONG",

    /* =========================
       NOTIFICATIONS
    ========================= */
    notifications: "Mga Abiso",
    latest_updates: "Mga pinakabagong update",
    mark_all: "Markahan lahat",
    view_all_notifications: "Tingnan Lahat ng Abiso",
    notification_history: "Kasaysayan ng mga Abiso",
    all_notifications: "Lahat ng abiso",
    type: "Uri",
    time: "Oras",
    all_types: "Lahat ng Uri",
    info: "Impormasyon",
    success: "Tagumpay",
    warning: "Babala",
    any_time: "Kahit anong oras",
    last_7_days: "Huling 7 araw",
    last_30_days: "Huling 30 araw",

    /* =========================
       HELP PAGE
    ========================= */
    need_help: "Kailangan ng Tulong?",
    find_guides_answers_support: "Makahanap agad ng gabay, sagot, at suporta.",
    help_support: "Tulong at Suporta",
    video_tutorials: "Mga Video Tutorial",
    step_by_step_walkthroughs: "Sunod-sunod na gabay",
    faq: "Mga Madalas Itanong",
    quick_answers_and_fixes: "Mabilis na sagot at solusyon",
    support: "Suporta",
    submit_ticket_and_track_status: "Magpasa ng ticket at tingnan ang status",

    /* =========================
       HELP MODAL
    ========================= */
    guides_common_fixes_ticket_submission: "Mga gabay, karaniwang solusyon, at pagpapasa ng ticket",
    quick_guide: "Mabilis na Gabay",
    sidebar: "Menu sa Gilid",
    use_left_navigation_to_switch_modules: "Gamitin ang menu sa kaliwa para lumipat ng module.",
    click_bell_to_view_alerts_and_history: "I-click ang kampana para makita ang mga alerto at kasaysayan.",
    account_settings: "Mga Setting ng Account",
    update_profile_and_password: "I-update ang iyong profile at password.",
    data_safety: "Kaligtasan ng Data",
    avoid_refreshing_during_uploads: "Iwasang mag-refresh habang may ina-upload na file.",
    common_issues: "Mga Karaniwang Problema",
    page_disappeared_stuck_scroll: "“Nawala ang page” / hindi gumagalaw ang scroll",
    close_open_modal_then_refresh: "Isara ang anumang bukas na modal o panel, pagkatapos ay i-refresh ang page.",
    upload_not_showing: "Hindi lumalabas ang upload",
    confirm_file_type_size_keep_internet_stable: "Tiyaking tama ang uri at laki ng file at panatilihing maayos ang internet habang nag-a-upload.",
    session_expired: "Napaso ang session",
    login_again_if_inactive: "Mag-login muli kung matagal kang walang galaw sa system.",
    support_email: "Email ng Suporta",
    submit_support_ticket: "Magpasa ng Support Ticket",
    ticket_history: "Kasaysayan ng Ticket",
    category: "Kategorya",
    priority: "Prayoridad",
    select_category: "Pumili ng kategorya",
    normal: "Karaniwan",
    priority_set_automatically: "Awtomatikong itinatakda ang prayoridad batay sa kategorya.",
    subject: "Paksa",
    short_summary_placeholder: "Maikling buod (hal., hindi makapag-upload ng profile photo)",
    message: "Mensahe",
    describe_issue_placeholder: "Ilarawan ang problema. Isama ang mga hakbang para maulit ito kung maaari.",
    tip_include_page_and_button: "Tip: isama kung anong page ang binuksan mo at anong button ang pinindot mo.",
    submit_ticket: "Ipasa ang Ticket",

    /* =========================
       MY PIGS
    ========================= */
    my_pigs_title: "Mga Baboy Ko",
    manage_livestock_efficiently: "Maayos na pamahalaan ang iyong mga alagang baboy",
    search_by_tag_id: "Maghanap gamit ang Tag ID...",
    piglets: "Mga Biik",
    sows: "Mga Inahin",
    boars: "Mga Barako",

    /* =========================
       REPORT - HEAT MONITORING
    ========================= */
    report_heat_monitoring: "ULAT - PAGSUBAYBAY SA HEAT",
    track_breeding_cycle_pregnancy: "Subaybayan ang breeding cycle at progreso ng pagbubuntis",
    logs: "MGA TALA",
    create_report: "GUMAWA NG ULAT",
    archive: "ARKIBO",
    open_sows: "BUKAS NA MGA INAHIN",
    in_heat: "NASA HEAT",
    under_observation: "MINAMASDAN",
    pregnant: "BUNTIS",
    farrowing: "MANGANGANAK",
    lactating: "NAGPAPASUSO",
    approved: "Aprubado",
    rejected: "Tinanggihan",
    search_tag: "Maghanap ng tag...",
    next_check: "SUSUNOD NA CHECK",
    current_stage: "KASALUKUYANG YUGTO",
    days_remaining_25: "25 araw na lang",
    overdue_days_2: "Lagpas na sa takdang araw (2 araw na ang nakalipas)",
    view_details: "Tingnan ang Detalye",
    track_progress: "Subaybayan ang Progreso",
    active_cycle: "Aktibong Cycle",
    ai_scheduled: "Naka-iskedyul ang AI",

    /* =========================
       SCHEDULE PAGE
    ========================= */
    breeding_farrowing_schedule: "Iskedyul ng Breeding at Panganganak",
    monitor_ai_rechecks_farrowing_weaning: "Subaybayan ang Artificial Insemination, muling pag-check ng heat, panganganak, at weaning",
    tap_date_preview_tasks: "Pindutin ang petsa para makita ang mga gawain at aksyon sa kanang panel.",
    calendar_view: "Tingnan sa Kalendaryo",
    tasks: "Mga Gawain",
    no_scheduled_activities: "Walang naka-iskedyul na gawain.",
    farrowed: "Nanganak na",
    weaned: "Na-wean na",
    ai_due: "Takdang AI",
    plus_more: "+1 pa",

    /* =========================
       REPRODUCTION MONITORING
    ========================= */
    hi_farmer: "Kumusta, Magsasaka",
    reproduction_monitoring_title: "Pagsubaybay sa Reproduction",
    track_sow_cycles_monitor_piglets: "Subaybayan ang cycle ng inahin, bantayan ang mga biik, suriin ang performance, at tapusin ang selection.",
    filters: "Mga Filter",
    search_by_sow_tag_or_pig_id: "Maghanap gamit ang sow tag/pig ID at salain ayon sa status.",
    tag_or_pig_id: "Tag / Pig ID...",
    all_status: "Lahat ng Status",
    tip_try_pregnant_lactating_tag: "Tip: Subukan ang “buntis”, “nagpapasuso”, o sow tag.",
    sows_title: "Mga Inahin",
    tap_view_to_open_sow_details: "Pindutin ang View para buksan ang detalye ng inahin.",
    last_ai: "Huling AI",
    piglets_count: "Mga Biik",

    /* =========================
       SOW DETAILS / OVERVIEW
    ========================= */
    sow: "Inahin",
    overview_cycles_piglets_selection: "Pangkalahatang detalye, cycle, mga biik, selection",
    breed: "Lahi",
    dob: "Araw ng Kapanganakan",
    female_label: "Babae",
    male_label: "Lalaki",
    overview: "Pangkalahatan",
    reproduction: "Pagpaparami",
    latest_measurements: "Pinakabagong Sukat",
    last_record: "Huling tala",
    weight: "Timbang",
    body_length: "Haba ng Katawan",
    heart_girth: "Sukat ng Dibdib",
    teat_count: "Bilang ng Utong",
    teeth: "Bilang ng Ngipin",
    measurements_pulled_from_latest_record: "Ang mga sukat ay kinukuha mula sa pinakahuling performance record (kung mayroon).",
    piglet_summary: "Buod ng mga Biik",
    quick_actions: "Mabilis na Aksyon",
    view_cycles: "Tingnan ang mga Cycle",
    selection_process: "Proseso ng Selection",
    use_reproduction_tab_to_manage: "Gamitin ang Reproduction tab para buksan ang cycle at pamahalaan ang mga biik.",

    /* =========================
       REPRODUCTION TAB / CYCLES
    ========================= */
    cycles: "Mga Cycle",
    choose_cycle_to_view_records: "Pumili ng cycle para makita ang mga tala.",
    cycle: "Cycle",
    all_cycles: "Lahat ng cycle",
    cycle_1: "Cycle 1",
    service_date: "Petsa ng Service",
    boar: "Barako",
    open_cycle: "Buksan ang Cycle",
    page_of_cycles: "Pahina {{page}} ng {{total}} • {{count}} cycle",

    /* =========================
       CYCLE DETAILS / TABS
    ========================= */
    cycle_details: "Detalye ng Cycle",
    ai_record_performance_growth_selection: "AI record • performance • paglaki • selection",
    artificial_insemination_record: "Tala ng Artificial Insemination",
    breeding_performance: "Performance sa Breeding",
    growth_monitoring: "Pagsubaybay sa Paglaki",

    /* =========================
       AI RECORD TAB
    ========================= */
    sow_label: "Inahin",
    ai_service_date: "Petsa ng AI Service",
    cycle_status: "Katayuan ng Cycle",
    ai_record_id: "AI Record ID",
    service_details: "Detalye ng Service",
    boar_sire_tag_code: "Barako (Sire Tag / Code)",
    pregnancy_confirmed: "Kumpirmadong Buntis",
    expected_farrowing: "Inaasahang Panganganak",
    not_available: "Wala / Hindi available",

    /* =========================
       BREEDING PERFORMANCE TAB
    ========================= */
    alive_male: "Buhay na Lalaki",
    alive_female: "Buhay na Babae",
    deceased: "Namatay",
    male_piglet: "Lalaki • biik",
    female_piglet: "Babae • biik",

    /* =========================
       GROWTH MONITORING TAB
    ========================= */
    filter_piglets_open_chart: "Salain ang mga biik, pagkatapos ay buksan ang isa para makita ang tsart at mga diperensya.",
    sex_filter: "Filter ng Kasarian",
    filter_piglets_by_tag_or_stage: "Salain ang mga biik ayon sa tag o yugto...",
    suckling: "Sumisipsip pa",
    weight_trend: "Galaw ng Timbang",
    auto_updated_morphology: "Awtomatikong naa-update batay sa mga naitalang morphology entry",
    entries: "Mga Entry",
    monitoring_summary: "Buod ng Monitoring",
    current_growth_phase_readiness: "Kasalukuyang yugto ng paglaki ng biik at detalye ng kahandaan",
    monitoring_phase: "Yugto ng Monitoring",
    age_in_days: "Edad sa Araw",
    days_remaining: "Natitirang Araw",
    selection_eligibility: "Kwalipikado sa Selection",
    not_yet: "Hindi Pa",
    deformities: "Mga Deperensya",
    no_deformities_found: "Walang nakitang deperensya.",

    /* =========================
       SELECTION PROCESS TAB
    ========================= */
    filter_piglets_open_selection: "Salain ang mga biik, pagkatapos ay buksan ang isa para makita ang status at mga aksyon sa selection.",
    retain: "Panatilihin",
    for_sale: "Ipagbili",
    pending: "Nakahintay",
    decision_filter: "Filter ng Desisyon",
    mark_as_culled_sale: "Markahan bilang Culled/Ibebenta",
    system_suggestion_continue_monitoring: "Mungkahi ng System: Ipagpatuloy ang monitoring at itala ang mga update sa paglaki.",

    /* =========================
       SELECTION DETAILS
    ========================= */
    selection_details: "Detalye ng Selection",
    status_suggestion_actions: "Status, mungkahi, at mga aksyon",
    stage_monitoring_day_1_30: "Yugto: Monitoring (Araw 1-30)",
    last_update: "Huling update",
    final_selection_allowed_after_weaning: "Pinapayagan lamang ang pinal na aksyon sa selection pagkatapos ng weaning / final selection stage.",
    system_suggestion_pending_insufficient: "Mungkahi ng System: Pending (kulang ang records).",
    actions_update_selection_status: "Ina-update ng mga aksyon ang selection status ng biik na ito.",
    note_piglet_not_eligible: "Tandaan: Hindi pa kwalipikado ang biik na ito (dapat ay weaned / nasa final selection stage na).",
    sell: "Ibenta",

    /* =========================
       BREED QUALITY ANALYTICS
    ========================= */
    swine_breed_quality_analysis: "Pagsusuri ng Kalidad ng Lahi ng Baboy",
    rankings_and_compatibility_insights: "Mga ranggo at compatibility sa breeding batay sa performance, katangian, at reproductive history.",
    search_swine_id: "Hanapin ang Swine ID...",
    tip_filter_by_swine_id_then_sex: "Tip: mabilis na mag-filter gamit ang Swine ID, pagkatapos ay salain pa gamit ang Sex chips sa ibaba.",
    breed_quality_rankings: "Ranggo ng Kalidad ng Lahi",
    quick_scan_best_candidates: "Mabilisang tingin sa pinakamahuhusay mong kandidato para sa breeding selection.",
    high: "Mataas",
    medium: "Katamtaman",
    low: "Mababa",
    stage: "Yugto",
    age: "Edad",
    length: "Haba",
    girth: "Sukat ng Dibdib",
    quality_index: "Quality Index",
    breeding_compatibility_checker: "Checker ng Breeding Compatibility",
    analyze_compatibility_minimize_inbreeding: "Suriin ang compatibility ng pares para mabawasan ang panganib ng inbreeding.",
    top_recommended_matches: "Pinakaangkop na Mga Pares",
    based_on_best_matches_top_quality: "Batay sa pinakamagandang pares mula sa de-kalidad na mga adult na inahin at barako.",
    identifying_best_matches: "Hinahanap ang pinakamagandang pares...",
    sow_female: "Inahin (Babae)",
    select_your_sow: "-- Piliin ang Iyong Inahin --",
    boar_male: "Barako (Lalaki)",
    select_your_boar: "-- Piliin ang Iyong Barako --",
    run_compatibility_analysis: "Patakbuhin ang Compatibility Analysis",
    adult: "adult",

    /* =========================
       PROFILE
    ========================= */
    pig_farmer: "Pig Farmer",
    account_profile: "Account Profile",
    profile_details: "Detalye ng Profile",
    review_account_information: "Tingnan ang impormasyon ng iyong account.",
    farmer_id: "Farmer ID",
    contact_number: "Numero ng Telepono",
    number_of_pens: "Bilang ng Kulungan",
    pen_capacity: "Kapasidad ng Kulungan",
    edit_profile: "I-edit ang Profile",

    /* =========================
       EDIT PROFILE
    ========================= */
    update_contact_details_and_capacity: "I-update ang contact details at kapasidad ng farm.",
    change_photo: "Palitan ang Litrato",
    jpg_png_recommended: "JPG/PNG ang inirerekomenda. Mas maganda ang parisukat na larawan.",
    change_password: "Palitan ang Password"
  }
};

/* =========================================================
   MODULE: CORE HELPERS
========================================================= */
export function getCurrentLanguage() {
  return localStorage.getItem("lang") || DEFAULT_LANG;
}

export function setCurrentLanguage(lang) {
  localStorage.setItem("lang", farmerTranslations[lang] ? lang : DEFAULT_LANG);
}

export function resetCurrentLanguage() {
  localStorage.removeItem("lang");
}

export function t(key, fallback = "", vars = {}) {
  const lang = getCurrentLanguage();
  const dict = farmerTranslations[lang] || farmerTranslations.en;
  let text = dict[key] || farmerTranslations.en[key] || fallback || key;

  Object.entries(vars).forEach(([varKey, value]) => {
    text = text.replaceAll(`{{${varKey}}}`, String(value));
  });

  return text;
}

/* =========================================================
   MODULE: APPLY DOM LANGUAGE
   USAGE:
   - Put data-i18n="settings" on elements
   - Optional: data-i18n-placeholder="search_by_tag_id"
========================================================= */
export function applyLanguage(lang = DEFAULT_LANG) {
  const safeLang = farmerTranslations[lang] ? lang : DEFAULT_LANG;
  document.documentElement.lang = safeLang;
  setCurrentLanguage(safeLang);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = t(key, el.textContent || "");
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    el.placeholder = t(key, el.placeholder || "");
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.title = t(key, el.title || "");
  });

  document.querySelectorAll("[data-i18n-value]").forEach((el) => {
    const key = el.dataset.i18nValue;
    if (!key) return;
    el.value = t(key, el.value || "");
  });
}

/* =========================================================
   MODULE: SETTINGS INITIALIZER
========================================================= */
export function initFarmerLanguage({
  languageSelectId = "languageSelect",
  saveButtonId = "saveSettings",
  resetButtonId = "resetSettings",
  onLanguageChange = null
} = {}) {
  const languageSelect = document.getElementById(languageSelectId);
  const saveButton = document.getElementById(saveButtonId);
  const resetButton = document.getElementById(resetButtonId);

  const initialLang = getCurrentLanguage();

  if (languageSelect) {
    languageSelect.value = initialLang;
  }

  applyLanguage(initialLang);

  if (typeof onLanguageChange === "function") {
    onLanguageChange(initialLang);
  }

  saveButton?.addEventListener("click", () => {
    const selectedLang = languageSelect?.value || DEFAULT_LANG;
    applyLanguage(selectedLang);

    if (typeof onLanguageChange === "function") {
      onLanguageChange(selectedLang);
    }

    alert(t("settings_saved"));
  });

  resetButton?.addEventListener("click", () => {
    resetCurrentLanguage();

    if (languageSelect) {
      languageSelect.value = DEFAULT_LANG;
    }

    applyLanguage(DEFAULT_LANG);

    if (typeof onLanguageChange === "function") {
      onLanguageChange(DEFAULT_LANG);
    }

    alert(t("settings_reset"));
  });
}