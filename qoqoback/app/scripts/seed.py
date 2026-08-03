"""Заполняет базу стартовыми данными.

Запуск:  .venv/Scripts/python.exe -m app.scripts.seed

Скрипт идемпотентный: повторный запуск ничего не дублирует.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.routes.users import UNUSABLE_PASSWORD
from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    SETTINGS_ID,
    AppSettings,
    BlockType,
    ContentBlock,
    Contract,
    Counterparty,
    Division,
    Nomenclature,
    Organization,
    Outlet,
    OutletType,
    ProductCategory,
    UnitOfMeasure,
    User,
    UserRole,
    Warehouse,
)
from app.services.invitations import build_link, create_invitation, send_invitation

CATEGORIES = [
    ("01", "Целая птица", 10),
    ("02", "Разделка", 20),
    ("03", "Субпродукты", 30),
    ("04", "Полуфабрикаты", 40),
    ("05", "Маринованная продукция", 50),
    ("06", "Замороженная продукция", 60),
]

# (код, наименование, группа, весовой, цена за ед., артикул)
PRODUCTS = [
    ("1001", "Тушка цыплёнка-бройлера охлаждённая", "01", True, Decimal("1290.00"), "QQ-1001"),
    ("1002", "Тушка цыплёнка-бройлера замороженная", "01", True, Decimal("1190.00"), "QQ-1002"),
    ("2001", "Филе грудки охлаждённое", "02", True, Decimal("2490.00"), "QQ-2001"),
    ("2002", "Бедро охлаждённое", "02", True, Decimal("1590.00"), "QQ-2002"),
    ("2003", "Голень охлаждённая", "02", True, Decimal("1490.00"), "QQ-2003"),
    ("2004", "Крыло охлаждённое", "02", True, Decimal("1350.00"), "QQ-2004"),
    ("2005", "Окорочок охлаждённый", "02", True, Decimal("1450.00"), "QQ-2005"),
    ("3001", "Желудки бройлера", "03", True, Decimal("890.00"), "QQ-3001"),
    ("3002", "Сердце бройлера", "03", True, Decimal("1190.00"), "QQ-3002"),
    ("3003", "Печень бройлера", "03", True, Decimal("990.00"), "QQ-3003"),
    ("4001", "Наггетсы куриные", "04", False, Decimal("1690.00"), "QQ-4001"),
    ("4002", "Фарш куриный", "04", True, Decimal("1390.00"), "QQ-4002"),
    ("5001", "Шашлык куриный маринованный", "05", True, Decimal("2190.00"), "QQ-5001"),
    ("5002", "Крыло маринованное", "05", True, Decimal("1790.00"), "QQ-5002"),
]

COUNTERPARTIES = [
    ("К-0001", "Магнум Cash&Carry", "020140000123", "г. Астана, пр. Туран, 37"),
    ("К-0002", "Small ТОО", "030240000456", "г. Астана, ул. Кабанбай батыра, 15"),
    ("К-0003", "Анвар супермаркет", "041140000789", "г. Астана, ул. Сыганак, 10"),
    ("К-0004", "Магазин у дома «Береке»", "051240000321", "г. Астана, ул. Кокпар, 2а"),
]

# (код, наименование, цвет метки, порядок)
OUTLET_TYPES = [
    ("ТТ-01", "Супермаркет", "#00533B", 10),
    ("ТТ-02", "Гипермаркет", "#0B6E4F", 20),
    ("ТТ-03", "Магазин", "#D4AF37", 30),
    ("ТТ-04", "Магазин у дома", "#C08B2E", 40),
    ("ТТ-05", "Рынок", "#B5651D", 50),
    ("ТТ-06", "Оптовая база", "#5A6B57", 60),
    ("ТТ-07", "HoReCa", "#333333", 70),
]

# (код, наименование, код контрагента, код типа, адрес)
OUTLETS = [
    ("ТП-0001", "Магнум на Туран", "К-0001", "ТТ-02", "г. Астана, пр. Туран, 37"),
    ("ТП-0002", "Магнум на Сарыарка", "К-0001", "ТТ-01", "г. Астана, пр. Сарыарка, 11"),
    (
        "ТП-0003",
        "Small на Кабанбай батыра",
        "К-0002",
        "ТТ-01",
        "г. Астана, ул. Кабанбай батыра, 15",
    ),
    ("ТП-0004", "Анвар на Сыганак", "К-0003", "ТТ-01", "г. Астана, ул. Сыганак, 10"),
    ("ТП-0005", "Береке на Кокпар", "К-0004", "ТТ-04", "г. Астана, ул. Кокпар, 2а"),
    ("ТП-0006", "Точка на рынке Артём", "К-0004", "ТТ-05", "г. Астана, рынок Артём, павильон 14"),
]


CONTENT_BLOCKS = [
    {
        "block_type": BlockType.HERO,
        "translations": {
            "kk": {
                "title": "Сенім сыйлайтын балғындық",
                "subtitle": "Свежесть, которой доверяют",
                "payload": {
                    "lead": "Астана және облыс бойынша құс фабрикасы өнімінің дистрибуциясы. "
                    "Меншікті көлік паркі, тапсырыс берілген күні жеткізу.",
                    "cta_text": "Серіктес болу",
                    "badges": [
                        {"title": "HALAL", "subtitle": "Сертификатталған"},
                        {"title": "ISO 22000", "subtitle": "Тағам қауіпсіздігі"},
                        {"title": "HACCP", "subtitle": "Сапа бақылауы"},
                    ],
                },
            }
        },
        "title": "Свежесть, которой доверяют",
        "subtitle": "Сенім сыйлайтын балғындық",
        "sort_order": 10,
        "payload": {
            "lead": "Дистрибуция продукции птицефабрики по Астане и области. "
            "Собственный автопарк, доставка в день заказа.",
            "cta_text": "Стать партнёром",
            "cta_link": "#contacts",
            "badges": [
                {"title": "HALAL", "subtitle": "Сертифицировано"},
                {"title": "ISO 22000", "subtitle": "Пищевая безопасность"},
                {"title": "HACCP", "subtitle": "Контроль качества"},
            ],
        },
    },
    {
        "block_type": BlockType.FEATURES,
        "translations": {
            "kk": {
                "title": "Бізді неге таңдайды",
                "payload": {
                    "items": [
                        {
                            "icon": "eco",
                            "title": "Табиғи өнім",
                            "subtitle": "Өсу гормондарынсыз, тек табиғи жем",
                        },
                        {
                            "icon": "ac_unit",
                            "title": "Жаңа салқындату",
                            "subtitle": "Фермадан сөреге дейін үзіліссіз суық тізбек",
                        },
                        {
                            "icon": "verified",
                            "title": "Сапа кепілдігі",
                            "subtitle": "Өндірістің әр кезеңінде бақылау",
                        },
                        {
                            "icon": "local_shipping",
                            "title": "Уақытында жеткізу",
                            "subtitle": "16:00-ге дейінгі тапсырыс — келесі таңертең тиеу",
                        },
                    ]
                },
            }
        },
        "title": "Почему выбирают нас",
        "sort_order": 20,
        "payload": {
            "items": [
                {
                    "icon": "eco",
                    "title": "Натуральный продукт",
                    "subtitle": "Без гормонов роста, только натуральные корма",
                },
                {
                    "icon": "ac_unit",
                    "title": "Свежее охлаждение",
                    "subtitle": "Непрерывная холодовая цепь от фермы до полки",
                },
                {
                    "icon": "verified",
                    "title": "Гарантия качества",
                    "subtitle": "Контроль на каждом этапе производства",
                },
                {
                    "icon": "local_shipping",
                    "title": "Доставка в срок",
                    "subtitle": "Заявка до 16:00 — отгрузка на следующее утро",
                },
            ]
        },
    },
    {
        "block_type": BlockType.CATALOG,
        "translations": {
            "kk": {
                "title": "Өнім каталогы",
                "subtitle": "Кең ассортимент. Жоғары сапа. Адал өнім.",
                "payload": {
                    "items": [
                        {"title": "Тұтас құс", "count": "2 позиция"},
                        {"title": "Бөлшектеу", "count": "6 позиция"},
                        {"title": "Ішкі мүшелер", "count": "18 позиция"},
                        {"title": "Жартылай фабрикаттар", "count": "26 позиция"},
                        {"title": "Маринадталған өнім", "count": "34 позиция"},
                        {"title": "Мұздатылған өнім", "count": "42 позиция"},
                    ]
                },
            }
        },
        "title": "Каталог продукции",
        "subtitle": "Широкий ассортимент. Высокое качество. Честный продукт.",
        "sort_order": 30,
        "payload": {
            "items": [
                {"title": "Целая птица", "count": "2 позиции"},
                {"title": "Разделка", "count": "6 позиций"},
                {"title": "Субпродукты", "count": "18 позиций"},
                {"title": "Полуфабрикаты", "count": "26 позиций"},
                {"title": "Маринованная продукция", "count": "34 позиции"},
                {"title": "Замороженная продукция", "count": "42 позиции"},
            ]
        },
    },
    {
        "block_type": BlockType.ABOUT,
        "translations": {
            "kk": {
                "title": "Компания туралы",
                "payload": {
                    "text": "QoQo — сапаның жоғары стандарттарына, қауіпсіздік пен "
                    "табиғилыққа бағдарланған заманауи тауық еті өндірісі.",
                    "bullets": [
                        "Меншікті өндіріс және сапаны толық бақылау",
                        "Еуропалық стандарттарға сай заманауи жабдық",
                        "Күн сайын жаңа өнім: фермадан — дастарханыңызға",
                        "Өсу гормондарынсыз табиғи жем",
                    ],
                },
            }
        },
        "title": "О компании",
        "sort_order": 40,
        "payload": {
            "text": "QoQo — современное производство куриной продукции, ориентированное "
            "на высокие стандарты качества, безопасность и натуральность.",
            "bullets": [
                "Собственное производство и полный контроль качества",
                "Современное оборудование по европейским стандартам",
                "Свежая продукция каждый день: с фермы — на ваш стол",
                "Натуральные корма без гормонов роста",
            ],
        },
    },
    {
        "block_type": BlockType.CONTACTS,
        "translations": {
            "kk": {
                "title": "Байланыс",
                "payload": {
                    "address": "Қазақстан Республикасы, Астана қ., Оңтүстік-Шығыс ауданы, "
                    "Көкпар көшесі, 2а",
                    "legal_name": "SAFA ЖК",
                    "work_hours": "Дс–Сб, 08:00–18:00",
                },
            }
        },
        "title": "Контакты",
        "sort_order": 50,
        "payload": {
            "phone": "+7 (778) 658-01-43",
            "email": "info@qoqo.kz",
            "address": "Республика Казахстан, г. Астана, район Юго-Восток, переулок Кокпар, 2а",
            "legal_name": "ИП SAFA",
            "work_hours": "Пн–Сб, 08:00–18:00",
        },
    },
]


def get_or_create(db: Session, model: type, *, code: str, defaults: dict) -> object:
    obj = db.execute(select(model).where(model.code == code)).unique().scalar_one_or_none()
    if obj is not None:
        return obj
    obj = model(code=code, **defaults)
    db.add(obj)
    db.flush()
    return obj


def seed(db: Session) -> User:
    settings = get_settings()

    organization = get_or_create(
        db,
        Organization,
        code="ORG-001",
        defaults={
            "name": "ИП SAFA",
            "full_name": "Индивидуальный предприниматель SAFA",
            "bin": "990140000111",
            "address": "Республика Казахстан, г. Астана, район Юго-Восток, переулок Кокпар, 2а",
            "phone": "+7 (778) 658-01-43",
        },
    )

    division = get_or_create(
        db,
        Division,
        code="ПОД-001",
        defaults={"name": "Отдел продаж", "organization_id": organization.id},
    )
    get_or_create(
        db,
        Division,
        code="ПОД-002",
        defaults={"name": "Логистика и склад", "organization_id": organization.id},
    )

    warehouse = get_or_create(
        db,
        Warehouse,
        code="СК-001",
        defaults={
            "name": "Основной склад (Астана)",
            "organization_id": organization.id,
            "address": "г. Астана, переулок Кокпар, 2а",
        },
    )
    get_or_create(
        db,
        Warehouse,
        code="СК-002",
        defaults={
            "name": "Склад заморозки",
            "organization_id": organization.id,
            "address": "г. Астана, переулок Кокпар, 2а",
        },
    )

    kg = get_or_create(
        db,
        UnitOfMeasure,
        code="166",
        defaults={"name": "кг", "full_name": "Килограмм", "okei_code": "166"},
    )
    get_or_create(
        db,
        UnitOfMeasure,
        code="796",
        defaults={"name": "шт", "full_name": "Штука", "okei_code": "796"},
    )
    get_or_create(
        db,
        UnitOfMeasure,
        code="778",
        defaults={"name": "упак", "full_name": "Упаковка", "okei_code": "778"},
    )

    categories: dict[str, ProductCategory] = {}
    for code, name, sort_order in CATEGORIES:
        categories[code] = get_or_create(
            db, ProductCategory, code=code, defaults={"name": name, "sort_order": sort_order}
        )

    for code, name, category_code, is_weight, price, article in PRODUCTS:
        get_or_create(
            db,
            Nomenclature,
            code=code,
            defaults={
                "name": name,
                "article": article,
                "category_id": categories[category_code].id,
                "base_unit_id": kg.id,
                "is_weight_goods": is_weight,
                "price": price,
                "vat_rate": Decimal(12),
            },
        )

    counterparties: dict[str, Counterparty] = {}
    for code, name, bin_iin, address in COUNTERPARTIES:
        counterparty = get_or_create(
            db,
            Counterparty,
            code=code,
            defaults={
                "name": name,
                "full_name": name,
                "bin_iin": bin_iin,
                "address": address,
                "phone": "+7 (700) 000-00-00",
            },
        )
        counterparties[code] = counterparty
        get_or_create(
            db,
            Contract,
            code=f"Д-{code}",
            defaults={
                "name": f"Договор поставки с {name}",
                "counterparty_id": counterparty.id,
                "organization_id": organization.id,
                "number": f"{code}/2026",
                "contract_date": date(2026, 1, 1),
                "payment_days": 14,
                "credit_limit": Decimal("1000000.00"),
            },
        )

    outlet_types: dict[str, OutletType] = {}
    for code, name, color, sort_order in OUTLET_TYPES:
        outlet_types[code] = get_or_create(
            db,
            OutletType,
            code=code,
            defaults={"name": name, "color": color, "sort_order": sort_order},
        )

    for code, name, counterparty_code, type_code, address in OUTLETS:
        get_or_create(
            db,
            Outlet,
            code=code,
            defaults={
                "name": name,
                "counterparty_id": counterparties[counterparty_code].id,
                "outlet_type_id": outlet_types[type_code].id,
                "address": address,
                "phone": "+7 (700) 000-00-00",
            },
        )

    if db.execute(select(func.count()).select_from(ContentBlock)).scalar_one() == 0:
        for block in CONTENT_BLOCKS:
            db.add(ContentBlock(**block))
    else:
        # База уже наполнена: тексты не трогаем, но доливаем переводы тем блокам,
        # где их ещё нет, — иначе на базе, созданной до появления переводов,
        # казахская версия осталась бы пустой.
        by_type = {block["block_type"]: block for block in CONTENT_BLOCKS}
        existing = db.execute(select(ContentBlock)).scalars().all()
        for row in existing:
            if row.translations:
                continue
            defaults = by_type.get(row.block_type)
            if defaults and defaults.get("translations"):
                row.translations = defaults["translations"]

    if db.get(AppSettings, SETTINGS_ID) is None:
        db.add(
            AppSettings(
                id=SETTINGS_ID,
                company_name="QoQo",
                legal_name="ИП SAFA",
                phone="+7 (778) 658-01-43",
                email="info@qoqo.kz",
                address=("Республика Казахстан, г. Астана, район Юго-Восток, переулок Кокпар, 2а"),
                hero_title="Свежесть, которой доверяют",
                hero_subtitle="Сенім сыйлайтын балғындық",
            )
        )

    # Администратор заводится без пароля: он задаёт его сам по ссылке-приглашению.
    admin = (
        db.execute(select(User).where(func.lower(User.email) == settings.seed_owner_email.lower()))
        .unique()
        .scalar_one_or_none()
    )

    if admin is None:
        admin = User(
            email=settings.seed_owner_email.lower(),
            full_name="Администратор системы",
            hashed_password=UNUSABLE_PASSWORD,
            role=UserRole.ADMIN,
            organization_id=organization.id,
            division_id=division.id,
        )
        db.add(admin)
        db.flush()

    # Демонстрационные сотрудники — чтобы систему можно было посмотреть под
    # каждой ролью. В бою их следует отключить и завести своих через приглашения.
    demo_users = [
        ("director@qoqo.kz", "Директор", UserRole.DIRECTOR, None),
        ("buh@qoqo.kz", "Бухгалтер", UserRole.ACCOUNTANT, None),
        ("agent@qoqo.kz", "Торговый представитель", UserRole.SALES_REP, None),
        ("sklad@qoqo.kz", "Кладовщик", UserRole.WAREHOUSE, warehouse.id),
    ]

    for email, full_name, role, warehouse_id in demo_users:
        exists = (
            db.execute(select(User).where(func.lower(User.email) == email.lower()))
            .unique()
            .scalar_one_or_none()
        )
        if exists is not None:
            continue
        db.add(
            User(
                email=email.lower(),
                full_name=full_name,
                hashed_password=hash_password(settings.seed_owner_password),
                role=role,
                organization_id=organization.id,
                division_id=division.id,
                warehouse_id=warehouse_id,
            )
        )

    db.commit()
    return admin


def main() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        admin = seed(db)

        # Ссылку выдаём, только пока администратор не задал пароль.
        link = None
        if admin.hashed_password == UNUSABLE_PASSWORD:
            _, raw_token = create_invitation(db, user=admin)
            db.commit()
            sent = send_invitation(admin, raw_token)
            link = None if sent else build_link(raw_token)

    print("Стартовые данные загружены.\n")
    print(f"Администратор: {settings.seed_owner_email}")
    if link:
        print(
            "Пароль не задан. Ссылка для установки пароля (действует "
            f"{settings.invite_expire_hours} ч.):"
        )
        print(f"  {link}\n")
    else:
        print("  пароль уже задан либо приглашение отправлено письмом\n")

    print("Демонстрационные учётные записи:")
    print("  director@qoqo.kz — директор")
    print("  buh@qoqo.kz      — бухгалтер")
    print("  agent@qoqo.kz    — торговый представитель")
    print("  sklad@qoqo.kz    — склад")
    print(f"  пароль у всех: {settings.seed_owner_password}")


if __name__ == "__main__":
    main()
