import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'ar' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  dir: 'rtl' | 'ltr';
  t: (key: string, variables?: Record<string, string | number>) => string;
}

export function useCurrency(activeBranch?: string | null) {
  const { language } = useLanguage();
  let branch = activeBranch;
  if (!branch) {
    try {
      const session = JSON.parse(sessionStorage.getItem('hala_session') || '{}');
      branch = session.activeBranch;
    } catch (e) {}
  }
  const isQatar = branch && (branch.toLowerCase().includes('qatar') || branch.includes('قطر'));
  if (isQatar) {
    return language === 'ar' ? 'ر.ق' : 'QAR';
  }
  return language === 'ar' ? 'د.ب' : 'BHD';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, any>> = {
  en: {
    common: {
      confirmLogout: 'Confirm Logout',
      logout: 'Logout',
      close: 'Close',
      save: 'Save',
      cancel: 'Cancel',
      search: 'Search...',
      back: 'Back',
      branch: 'Branch',
      staff: 'Staff',
      salon: 'Salon',
      gym: 'Gym',
      total: 'Total',
      price: 'Price',
      sessions: 'Sessions',
      remaining: 'Remaining',
      currency: 'BHD',
      system_empty: 'System is empty',
      yes: 'Yes',
      no: 'No',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      none: 'None',
      actions: 'Actions',
      date: 'Date',
      time: 'Time'
    },
    header: {
      terminal_title: 'Salon & Gym Terminal',
      branch_label: 'Branch',
      staff_label: 'Active Staff',
      admin_settings: 'Admin Settings',
      logout: 'Logout'
    },
    login: {
      enter_pin: 'Enter Security PIN',
      verify_access: 'Verify Access',
      invalid_pin: 'Invalid Access PIN. Profile not registered.',
      system_empty_error: 'Invalid Access PIN. System is empty.',
      connection_error: 'Connection interrupted. Please try again.',
      security_note: 'Authorized Personnel Access Only'
    },
    branchSelect: {
      welcome: 'Welcome, {name}',
      select_branch: 'Select Active Branch',
      description: 'Configure your terminal to sync transactions and scheduling streams with the selected location.',
      sync_active: 'Real-time multi-branch synchronization active',
      enter: 'Enter Terminal',
      riffa_desc: 'Premium Wellness Suite & Salons',
      riffa_type: 'Signature Lounge',
      janabiya_desc: 'Executive Health Club & Spa',
      janabiya_type: 'Elite Sanctuary',
      busaiteen_desc: 'Luxury Hair & Fitness Lab',
      busaiteen_type: 'Urban Oasis',
      askar_desc: 'Coastal Wellness Hub & Gym',
      askar_type: 'Seaside Suite'
    },
    dashboard: {
      terminal_interface: 'Terminal Interface',
      welcome_staff: 'Bonjour, {name}',
      description: 'Active connection to {branch}. Select a client to track packages and assign sessions, or register a new customer.',
      clock: 'Real-time Clock',
      syncing: 'Synchronizing...',
      open_admin: 'Open Admin Settings'
    },
    customerList: {
      directory_title: 'Client Directory',
      directory_subtitle: 'Global Profiles & History',
      search_placeholder: 'Search by name or phone...',
      register_button: 'Register New Client',
      syncing_msg: 'Synchronizing Directory...',
      no_clients_title: 'No Clients Registered',
      no_clients_desc: 'The database is pristine and ready. Add your first customer to begin tracking packages, gym access, and financial transactions.',
      register_first: 'Register First Client',
      no_matches: 'No matches found for "{query}"',
      header_name: 'Client Name',
      header_phone: 'Contact Number',
      header_action: 'Action',
      select_client: 'Select Customer',
      add_new_title: 'Create New Client Profile',
      add_new_desc: 'This profile will be synced with the cloud database once saved for package tracking and card issuance.',
      input_name: 'Customer Full Name',
      input_phone: 'Customer Phone Number (e.g., 33xxxxxx)',
      validation_error: 'Full Name and Phone Number are required.',
      error_name: 'Invalid character list in client name. Only letters and spaces are allowed.',
      error_phone: 'Please supply a valid 8-digit mobile number.',
      error_exists: 'This mobile number is already linked to a registered profile.',
      button_cancel: 'Cancel',
      button_submit: 'Confirm Secure Registration',
      scan_card_note: 'You can also scan a client\'s card barcode using the scanner from anywhere to access their profile.'
    },
    customerProfile: {
      client_profile: 'Client Profile',
      registered_since: 'Registered since:',
      search_card_back: 'Back to Dashboard',
      contact_info: 'Contact Information',
      active_packages: 'Active Packages & Memberships',
      no_packages: 'No active packages or memberships found for this client.',
      category_salon: 'Salon Package',
      category_gym: 'Gym Membership',
      sessions_left: '{remaining} of {total} sessions left',
      sessions_value: 'Benefit value:',
      button_deduct: 'Deduct 1 Session',
      button_undo: 'Undo Last Deduction',
      button_add_pass: 'Purchase New Package / Pass',
      purchase_salon_pass: 'Purchase Salon Pass',
      purchase_gym_membership: 'Purchase Gym Membership',
      history_logs: 'History & Audit Logs',
      no_logs: 'No history logs configured or available.',
      table_action: 'Action Type',
      table_desc: 'Details / Description',
      table_timestamp: 'Date & Time',
      table_staff: 'Staff',
      table_branch: 'Branch',
      qr_header: 'Premium Digital Membership Card',
      qr_desc: 'Scan this QR Code from any terminal camera or hand scanner for instant high-speed verification.',
      qr_print_title: 'Print Professional QR Card',
      apple_wallet_btn: 'Issue Apple Wallet Pass',
      wallet_title: 'Apple Wallet Client Card',
      wallet_desc: 'This card integrates fully with the official Apple Wallet app. Once scanned with an iPhone camera, the client\'s pass will be saved on their passbook with real-time balance!',
      generate_card: 'Generating digital wallet configurations...',
      wallet_ready: 'Pass is Ready! Scan with iPhone camera to save:',
      download_file_direct: 'Or Download Pass File (.pkpass) Direct',
      local_warning_title: 'Software System Notice (Important):',
      local_warning_desc: 'You are browsing this site on a local server (localhost). Client mobile phones won\'t reach it on scanning since it is local.',
      local_warning_sol: 'To resolve this issue completely and automatically:',
      local_warning_step1: 'Go to Control Panel ➔ Settings at the top.',
      local_warning_step2: 'Set your public server URL in "Public App URL" under company settings.',
      local_warning_step3: 'The system will auto-use the public link for the QR, allowing clients to load onto their phone instantly on 4G/5G!',
      active_tunnel: 'Active Tunnel Mode',
      active_tunnel_desc: 'Splendid! The local server is utilizing the following mapped public URL to register and issue cards:'
    },
    pos: {
      checkout_title: 'New Sale & Checkout',
      checkout_subtitle: 'Allocate Pack & Issue Invoice',
      client_label: 'Current client Name:',
      payment_method: 'Select Settlement Payment Method',
      pay_card: 'ATM & Credit Card',
      pay_benefit: 'BenefitPay Direct Transfer',
      pay_cash: 'Cash Settlement',
      pay_previous: 'Paid Previously',
      select_pack_label: 'Select Target Service Package',
      no_packages_configured: 'No packages configured for this category in settings.',
      quantity: 'Select Purchase Quantity',
      summary: 'Financial Settlement Summary',
      item: 'Line Item / Service',
      qty: 'Qty',
      unit_price: 'Unit Price',
      total_price: 'Final Total',
      button_complete: 'Confirm Sale & Write Contract',
      saving: 'Processing checkout securely...',
      invoice_printed: 'Checkout successful! Refreshing and preparing thermal invoice copy.'
    },
    eod: {
      title: 'SHIFT END-OF-DAY SUMMARY',
      preview_mode: 'Thermal Print Preview',
      header_title: 'Hayat Beauty & Care',
      financial_totals: 'Financial Settlement Totals',
      total_rev: 'Total Revenue Generated',
      total_cash: 'Total Cash in Drawer',
      total_card: 'Total ATM & Credit Card',
      total_benefit: 'Total BenefitPay Transfer',
      operations_overview: 'Service Delivery Overview',
      salon_deliveries: 'Salon Service Deliveries',
      gym_deliveries: 'Active Gym Memberships',
      footer_receipt_1: 'Official End-of-Shift Terminal Audit',
      footer_receipt_2: 'Session closed. Have a peaceful evening.',
      print_receipt: 'Print Professional Receipt',
      confirm_text: 'Warning: You are about to logout and close the shift drawer. This action registers closing logs on the database.',
      btn_close: 'Resume Terminal Session',
      btn_confirm: 'Confirm Logout & Close Shift'
    },
    cafe: {
      sales_button: 'Coffee Sales',
      menu_title: 'Cafe & Refreshments',
      quantity: 'Quantity',
      add_to_order: 'Proceed to Checkout',
      something_else: 'Something Else',
      custom_name: 'Item Name',
      custom_price: 'Price',
      add_custom: 'Add Custom Item',
      mojito_menu: 'Mojito Menu',
      coffee_tea: 'Coffee & Tea Menu',
      coffee_menu: 'Coffee Menu',
      choose_flavor: 'Choose Flavor',
      flavor_blue_zesty: 'Blue Zesty Orange Mojito',
      flavor_blueberry: 'Blueberry Mojito',
      flavor_strawberry: 'Strawberry Mojito',
      flavor_watermelon: 'Watermelon Mojito',
      flavor_passion: 'Passion Fruit',
      item_7up: '7UP',
      item_redbull: 'Red Bull',
      item_karkadeh: 'Karkadeh',
      item_turkish: 'Turkish Coffee',
      item_french: 'French Coffee',
      item_red_tea: 'Red Tea',
      item_green_tea: 'Green Tea',
      item_espresso: 'Espresso',
      item_cappuccino: 'Cappuccino',
      item_americano: 'Americano',
      item_mocha: 'Mocha',
      item_caramel_macchiato: 'Caramel Macchiato',
      item_latte: 'Latte',
      item_spanish_latte: 'Spanish Latte',
      item_flat_white: 'Flat White',
      item_v60: 'V60'
    },
    admin: {
      terminal_admin: 'Global Administration Suite',
      subtitle: 'System parameters, staffs, packages & global enterprise settings',
      btn_return: 'Return to Terminal Dashboard',
      tab_staff: 'Staff & Access Security',
      tab_packages: 'Service Catalog & Passes',
      tab_branches: 'Branch Logistics',
      tab_company: 'Brand & Cloud Configuration',
      staff_list: 'Registered Active Staff Roster',
      add_staff: 'Register New Staff Member',
      name_label: 'Full Employee Name',
      pin_label: 'Personal Login PIN (Numerical)',
      pin_placeholder: '4 digits minimum for access security',
      role_label: 'System Role & Privilege',
      role_staff: 'Staff (Basic Terminal)',
      role_admin: 'Administrator (Full Suite)',
      perm_branches: 'Authorized Operating Branches',
      perm_all: 'Authorized on All Branches',
      btn_add_staff: 'Write Employee Credentials',
      saving_staff: 'Registering staff profile...',
      delete_title: 'Delete',
      edit_title: 'Edit',
      no_staff_configured: 'No staff profiles configured.',
      package_catalog: 'Active Service Catalog & Passes',
      add_package: 'Register New Package Template',
      pkg_name: 'Package Name',
      pkg_category: 'Catalog Category',
      pkg_sessions: 'Allocated Sessions / Passes',
      pkg_price: 'Retail Price (BHD)',
      btn_add_pkg: 'Publish Package into Catalog',
      no_packages: 'No package templates configured in catalog.',
      add_branch: 'Register Geographical Branch',
      btn_add_branch: 'Publish Branch',
      warn_branch: 'A branch deletion updates dependent staff profiles automatically.',
      brand_parameters: 'Global Enterprise Parameters',
      company_name_label: 'Company Brand Name',
      company_name_placeholder: 'e.g., Hayat Beauty & Care',
      public_url_label: 'Public App URL',
      public_url_placeholder: 'https://yourcustomdomain.com or Cloud Run URL',
      public_url_note: 'The external address connecting client devices with card servers. On local localhost servers, utilize ngrok/tunnels for routing and write here so card links work smoothly.',
      btn_lock_brand: 'Lock Brand Configurations',
      edit_staff_title: 'Edit Staff Member',
      edit_pkg_title: 'Edit Package Template'
    }
  },
  ar: {
    common: {
      confirmLogout: 'تأكيد تسجيل الخروج',
      logout: 'تسجيل الخروج',
      close: 'إغلاق',
      save: 'حفظ',
      cancel: 'إلغاء',
      search: 'بحث...',
      back: 'رجوع',
      branch: 'الفرع',
      staff: 'الموظف',
      salon: 'الصالون',
      gym: 'الجيم',
      total: 'الإجمالي',
      price: 'السعر',
      sessions: 'جلسات',
      remaining: 'المتبقي',
      currency: 'د.ب',
      system_empty: 'النظام فارغ',
      yes: 'نعم',
      no: 'لا',
      loading: 'جاري التحميل...',
      error: 'خطأ',
      success: 'نجاح',
      none: 'لا يوجد',
      actions: 'العمليات',
      date: 'التاريخ',
      time: 'الوقت'
    },
    header: {
      terminal_title: 'منصة الصالون والجيم',
      branch_label: 'الفرع',
      staff_label: 'الموظف النشط',
      admin_settings: 'إعدادات الإدارة',
      logout: 'تسجيل الخروج'
    },
    login: {
      enter_pin: 'أدخل رمز الدخول PIN',
      verify_access: 'التحقق من الدخول',
      invalid_pin: 'رمز الدخول غير صحيح. الحساب غير مسجل.',
      system_empty_error: 'رمز الدخول غير صحيح. النظام فارغ حالياً.',
      connection_error: 'انقطع الاتصال بالشبكة. يرجى المحاولة مرة أخرى.',
      security_note: 'مسموح بالدخول للموظفين المصرح لهم فقط'
    },
    branchSelect: {
      welcome: 'مرحباً، {name}',
      select_branch: 'اختر الفرع النشط',
      description: 'قم بتهيئة وحدة التحكم لمزامنة المعاملات وجدول الجلسات مع الفرع المحدد.',
      sync_active: 'مزامنة نشطة بين جميع فروع المؤسسة تلقائياً',
      enter: 'دخول للفرع',
      riffa_desc: 'جناح العافية والجمال الفاخر الصالون',
      riffa_type: 'الصالون الأساسي',
      janabiya_desc: 'نادي وصالون عالي الرياضة والسبا',
      janabiya_type: 'الملتقى النخبوي',
      busaiteen_desc: 'مختبر الشعر واللياقة البدنية الفاخر',
      busaiteen_type: 'الواحة الحضرية',
      askar_desc: 'مركز العافية الساحلي وصالة الرياضة',
      askar_type: 'الجناح الشاطئي'
    },
    dashboard: {
      terminal_interface: 'واجهة الفرع النشطة',
      welcome_staff: 'أهلاً بك، {name}',
      description: 'اتصال نشط بالفرع: {branch}. حدد عميلاً لمتابعة باقاته وخصم جلساته، أو تسجيل عميل جديد.',
      clock: 'التوقيت المباشر للفرع',
      syncing: 'جاري جلب البيانات...',
      open_admin: 'لوحة تحكم الإدارة'
    },
    customerList: {
      directory_title: 'دليل العملاء والزوار',
      directory_subtitle: 'قاعدة بيانات المشتركين والزيارات',
      search_placeholder: 'ابحث عن عميل بالاسم أو رقم الهاتف...',
      register_button: 'تسجيل عميل جديد',
      syncing_msg: 'جاري تحديث الدليل...',
      no_clients_title: 'لا يوجد عملاء مسجلين بعد',
      no_clients_desc: 'قاعدة البيانات فارغة حالياً. أضف عميلك الأول للبدء في تتبع الباقات والمشتركات والعمليات المالية.',
      register_first: 'سجل عميلك الأول الآن',
      no_matches: 'لا توجد نتائج مطابقة لـ "{query}"',
      header_name: 'اسم العميل',
      header_phone: 'رقم الاتصال',
      header_action: 'التحكم',
      select_client: 'عرض الملف الشخصي',
      add_new_title: 'إنشاء ملف عميل جديد',
      add_new_desc: 'سيلتحق هذا الملف بقاعدة البيانات السحابية بمجرد حفظه لمزاولة النشاط وصرف البطاقات.',
      input_name: 'الاسم الكامل للعميل',
      input_phone: 'رقم هاتف العميل (مثال: 33xxxxxx)',
      validation_error: 'الاسم الكامل ورقم الهاتف مطلوبان لإكمال التسجيل.',
      error_name: 'اسم العميل يحتوي على رموز غير صالحة. يسمح فقط بالحروف والمسافات.',
      error_phone: 'يرجى إدخال رقم هاتف بحريني صحيح مكون من 8 أرقام.',
      error_exists: 'رقم الهاتف هذا مسجل بالفعل لعميل آخر.',
      button_cancel: 'إلغاء',
      button_submit: 'تأكيد التسجيل السريع',
      scan_card_note: 'يمكنك كذلك مسح بطاقة العميل ضوئياً بالباركود من أي مكان للدخول مباشرة لملفه.'
    },
    customerProfile: {
      client_profile: 'الملف التعريفي للعميل',
      registered_since: 'تاريخ التسجيل:',
      search_card_back: 'الرجوع للقائمة الرئيسية',
      contact_info: 'معلومات الاتصال',
      active_packages: 'الاشتراكات والباقات النشطة',
      no_packages: 'لا يوجد أي باقة أو اشتراك نشط لهذا العميل حالياً.',
      category_salon: 'خدمة صالون',
      category_gym: 'عضوية الجيم',
      sessions_left: 'متبقي {remaining} من أصل {total} جلسة',
      sessions_value: 'القيمة المستفاد بها:',
      button_deduct: 'خصم جلسة واحدة',
      button_undo: 'تراجع عن الخصم الأخير',
      button_add_pass: 'شراء باقة / اشتراك جديد',
      purchase_salon_pass: 'شراء بطاقة صالون',
      purchase_gym_membership: 'شراء عضوية جيم',
      history_logs: 'أرشيف العمليات وسجل التدقيق',
      no_logs: 'لا توجد سجلات تاريخية للعمليات المسجلة للعميل.',
      table_action: 'نوع العملية',
      table_desc: 'التفصيل والوصف',
      table_timestamp: 'التاريخ والوقت',
      table_staff: 'الموظف المسؤول',
      table_branch: 'الفرع',
      qr_header: 'بطاقة العضوية الذكية الفاخرة',
      qr_desc: 'امسح الـ QR Code من الكاميرا أو جهاز مسح الباركود للوصول المباشر والسريع إلى ملف العميل.',
      qr_print_title: 'طباعة بطاقة العضوية الورقية',
      apple_wallet_btn: 'إرسال لـ Apple Wallet',
      wallet_title: 'بطاقة العميل لـ Apple Wallet',
      wallet_desc: 'البطاقة مدمجة بالكامل مع تطبيق محفظة آبل الرسمي. بمجرد مسح هذا الكود بكاميرا الموبايل، سيتم تثبيت البطاقة على هاتف العميل وتحديث رصيد الجلسات فيها فورياً!',
      generate_card: 'جاري إصدار البطاقة وتحديث البيانات الرقمية...',
      wallet_ready: 'البطاقة جاهزة! امسح بكاميرا الآيفون للتحميل المباشر:',
      download_file_direct: 'أو حمّل ملف البطاقة مباشرة (.pkpass) للآيفون',
      local_warning_title: 'تنبيه مهندس برمجيات النظام (مهم):',
      local_warning_desc: 'أنت تتصفح هذا الموقع حالياً عبر خادم محلي (localhost). موبايلات العملاء لن تتمكن من الوصول إلى هذا الرابط عندما يمسحون كود الـ QR لأنه محلي.',
      local_warning_sol: 'لحل المشكلة نهائياً وتلقائياً:',
      local_warning_step1: 'قم بالدخول إلى لوحة التحكم ➔ الإعدادات (Settings) في الأعلى.',
      local_warning_step2: 'ضع عنوان سيرفرك العام تحت خيار عنوان الرابط العام للتطبيق (Public App URL) في تبويب الشركة.',
      local_warning_step3: 'سيقوم النظام بتحديث الـ QR Code تلقائياً ليستخدم الرابط العام، بمسحه ستحمل البطاقة فوراً على 4G/5G!',
      active_tunnel: 'وضع التوصيل العام نشط (Active Tunnel Mode)',
      active_tunnel_desc: 'رائع! السيرفر المحلي يستعمل العنوان الموجه التالي لإنتاج بطاقة العميل:'
    },
    pos: {
      checkout_title: 'إجراء عملية بيع وشراء جديدة',
      checkout_subtitle: 'توزيع الجلسات وصرف الفواتير',
      client_label: 'العميل الحالي:',
      payment_method: 'طريقة دفع وسداد الفاتورة',
      pay_card: 'صراف وبطاقة بنكية',
      pay_benefit: 'بنفت باي (BenefitPay)',
      pay_cash: 'دفع نقدي كاش',
      pay_previous: 'مدفوع مسبقاً بالتنسيق',
      select_pack_label: 'اختر الباقة / الاشتراك المطلوب',
      no_packages_configured: 'لم يتم تهيئة باقات لهذا القسم في الإعدادات.',
      quantity: 'الكمية المطلوبة (عدد الباقات المشتراة)',
      summary: 'تفاصيل ملخص الفاتورة المالية',
      item: 'البيان / الخدمة',
      qty: 'الكمية',
      unit_price: 'سعر الوحدة',
      total_price: 'الإجمالي النهائي',
      button_complete: 'إصدار الفاتورة وتثبيت العقد',
      saving: 'جاري معالجة الدفع السحابي...',
      invoice_printed: 'تمت العملية بنجاح! جاري إنتاج معاينة إيصال الدفع للطباعة.'
    },
    eod: {
      title: 'تقرير نهاية الدوام وإغلاق صندوق الوردية',
      preview_mode: 'معاينة طباعة الإيصال الحراري',
      header_title: 'مجموعة حياة للجمال والعناية',
      financial_totals: 'ملخص المداخيل المالية للوردية',
      total_rev: 'مجموع إيرادات الوردية',
      total_cash: 'مجموع الكاش والنقدي',
      total_card: 'مدفوعات صراف وبطاقات',
      total_benefit: 'مدفوعات بنفت باي (BenefitPay)',
      operations_overview: 'ملخص الخدمات والزيارات المصروفة',
      salon_deliveries: 'عمليات وجلسات صالون منجزة',
      gym_deliveries: 'اشتراكات وخدمات جيم مفعلة',
      footer_receipt_1: 'تعتبر هذه طباعة أصلية صالحة للتدوين',
      footer_receipt_2: 'تمت مراجعة الوردية وإقفال الحسابات لليوم',
      print_receipt: 'طباعة الإيصال بالتصميم الحراري',
      confirm_text: 'تنبيه: أنت على وشك الخروج لإقفال صندوق الوردية الحالية بالكامل. لن تتمكن من الدخول ثانية دون تسجيل وردية جديدة.',
      btn_close: 'متابعة العمل في الوردية',
      btn_confirm: 'تسجيل الخروج وإغلاق الصندوق'
    },
    cafe: {
      sales_button: 'مبيعات الكافيه',
      menu_title: 'الكافيه والمرطبات',
      quantity: 'الكمية',
      add_to_order: 'متابعة للدفع',
      something_else: 'صنف آخر (غير مسجل)',
      custom_name: 'اسم الصنف',
      custom_price: 'السعر',
      add_custom: 'إضافة الصنف',
      mojito_menu: 'قائمة الموهيتو',
      coffee_tea: 'قائمة القهوة والشاي',
      coffee_menu: 'قائمة القهوة',
      choose_flavor: 'اختر النكهة',
      flavor_blue_zesty: 'موهيتو برتقال أزرق',
      flavor_blueberry: 'موهيتو توت أزرق',
      flavor_strawberry: 'موهيتو فراولة',
      flavor_watermelon: 'موهيتو بطيخ',
      flavor_passion: 'باشن فروت',
      item_7up: 'سفن أب',
      item_redbull: 'ريد بول',
      item_karkadeh: 'كركديه',
      item_turkish: 'قهوة تركية',
      item_french: 'قهوة فرنسية',
      item_red_tea: 'شاي أحمر',
      item_green_tea: 'شاي أخضر',
      item_espresso: 'إسبريسو',
      item_cappuccino: 'كابتشينو',
      item_americano: 'أمريكانو',
      item_mocha: 'موكا',
      item_caramel_macchiato: 'كراميل ماكياتو',
      item_latte: 'لاتيه',
      item_spanish_latte: 'سبانش لاتيه',
      item_flat_white: 'فلات وايت',
      item_v60: 'V60'
    },
    admin: {
      terminal_admin: 'الإدارة العامة ومراقبة الفروع',
      subtitle: 'إدارة الموظفين والخدمات والإعدادات لجميع الفروع والمؤسسة',
      btn_return: 'الرجوع لوحدة صالون وجيم',
      tab_staff: 'إدارة الكادر والموظفين',
      tab_packages: 'كتالوج الخدمات والباقات',
      tab_branches: 'الفروع الجغرافية واللوجستية',
      tab_company: 'معلمات الشركة والهوية السحابية',
      staff_list: 'سجل الموظفين النشطين والتحصيل',
      add_staff: 'إضافة موظف جديد',
      name_label: 'الاسم الكامل للموظف',
      pin_label: 'رمز المرور PIN الخاص بالموظف',
      pin_placeholder: 'أدخل 4 أرقام أو أكثر لتأمين الحساب',
      role_label: 'صلاحية الموظف في النظام',
      role_staff: 'موظف عادي (صرف وتعديد جلسات)',
      role_admin: 'إداري (تحكم كامل بجميع الفروع والتقارير)',
      perm_branches: 'الفروع الجغرافية المصرح له تسييرها',
      perm_all: 'كامل الصلاحية على كافة الفروع',
      btn_add_staff: 'تسجيل وتفعيل ملف الموظف',
      saving_staff: 'جاري حفظ بيانات الموظف...',
      delete_title: 'حذف',
      edit_title: 'تعديل',
      no_staff_configured: 'لا يوجد موظفين مسجلين في هذا القطاع.',
      package_catalog: 'كتالوج باقات وعضويات المؤسسة النشط',
      add_package: 'إضافة باقة / اشتراك جديد بالقسم',
      pkg_name: 'اسم الباقة مفرداً (مثال: بروتين الشعر الفاخر)',
      pkg_category: 'قسم الباقة الرئيسي والفرز',
      pkg_sessions: 'الرصيد المتاح من الجلسات والزيارات للعميل',
      pkg_price: 'تكلفة وسعر البيع المستحق (BHD)',
      btn_add_pkg: 'إدراج الباقة في لوحة الخدمات الفعالة',
      no_packages: 'لم يتم برمجة أي باقات خدمات في الكتالوج الراهن.',
      add_branch: 'إضافة فرع جغرافي جديد للمؤسسة',
      btn_add_branch: 'إدراج الفرع',
      warn_branch: 'تنبيه: إجراء حذف الفرع الجغرافي ينزع ترخيص الموظفين المسجلين تحته تلقائياً.',
      brand_parameters: 'المعلمات الكلية وبهية المؤسسة',
      company_name_label: 'الاسم التجاري للمؤسسة',
      company_name_placeholder: 'مثال: حياة للتجميل والعناية',
      public_url_label: 'عنوان الرابط العام للتطبيق (Public App URL)',
      public_url_placeholder: 'https://yourcustomdomain.com or Cloud Run URL',
      public_url_note: 'العنوان الخارجي الذي يربط الهواتف بسيرفر البطاقات. إذا كنت تستخدم خادماً محلياً، يرجى ملء هذا الحقل لتستجيب الهواتف فورياً بنظام آبل ويب.',
      btn_lock_brand: 'تطبيق وحفظ التعديلات',
      edit_staff_title: 'تعديل بيانات الموظف',
      edit_pkg_title: 'تعديل بيانات باقة'
    }
  }
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('hala_lang_pref') as Language) || 'ar'; // Default to Arabic as requested!
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('hala_lang_pref', lang);
  };

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    document.body.dir = dir;
  }, [language, dir]);

  const t = (path: string, variables?: Record<string, string | number>): string => {
    if (path === 'common.currency') {
      let branch = undefined;
      try {
        const session = JSON.parse(sessionStorage.getItem('hala_session') || '{}');
        branch = session.activeBranch;
      } catch (e) {}
      const useCurrency = (branch?: string | null) => {
        const isQatar = branch && (branch.toLowerCase().includes('qatar') || branch.includes('قطر'));
        if (isQatar) {
          return language === 'ar' ? 'ر.ق' : 'QAR';
        }
        return language === 'ar' ? 'د.ب' : 'BHD';
      };
      return useCurrency(branch);
    }

    const parts = path.split('.');
    let current: any = translations[language];
    for (const part of parts) {
      if (current && current[part] !== undefined) {
        current = current[part];
      } else {
        // Fallback to English
        let fallback: any = translations['en'];
        let sub = true;
        for (const fPart of parts) {
          if (fallback && fallback[fPart] !== undefined) {
            fallback = fallback[fPart];
          } else {
            sub = false;
            break;
          }
        }
        if (sub && fallback) {
          current = fallback;
          break;
        }
        return path; // absolute fallback
      }
    }

    let text = String(current);
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        text = text.replace(`{${key}}`, String(value));
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, dir, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
