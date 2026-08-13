/**
 * Russian strings — single source of truth for ALL user-facing text.
 * Source: docs/ux-design.md §6 (master table). Never inline English UI strings elsewhere.
 * Structure: feature sections (common, home, painting, form, location(s), owner, denied, expired).
 * Errors: the API contract error catalog is re-exported at the bottom so screens
 * display server messages verbatim (packages/shared/src/api-contract.ts).
 */
import {
  ERROR_MESSAGES as apiErrorMessages,
  FIELD_ERROR_MESSAGES as apiFieldErrorMessages,
} from '@painting/shared';

export const strings = {
  common: {
    retry: 'Повторить',
    ok: 'Понятно',
    cancel: 'Отмена',
    close: 'Закрыть',
    loading: 'Загрузка…',
    saving: 'Сохраняем…',
    deleting: 'Удаляем…',
    back: 'Назад',
    save: 'Сохранить',
    edit: 'Изменить',
    delete: 'Удалить',
    add: 'Добавить',
    network: 'Нет соединения. Проверьте интернет.',
    generic: 'Что-то пошло не так. Попробуйте ещё раз.',
    connect: 'Не удалось подключиться. Проверьте интернет.',
    loadFailed: 'Не удалось загрузить. Проверьте интернет.',
    placeholders: 'Этот экран появится в следующей версии приложения.',
  },
  home: {
    title: 'Мои картины',
    add: '+ Добавить картину',
    addFirst: '+ Добавить первую картину',
    empty: 'У вас пока нет картин',
    emptyHint: 'Добавьте первую картину — фото, цену и место продажи.',
    footerLocations: 'Места продажи',
    footerOwner: 'Передать владельцу',
  },
  welcome: {
    banner: 'Добро пожаловать! Теперь это ваше приложение.',
    ok: 'Понятно',
  },
  painting: {
    title: 'Картина',
    photosCount: 'Фото {n} из {m}',
    edit: 'Изменить',
    delete: 'Удалить',
    openSite: 'Открыть сайт',
    deleteTitle: 'Удалить картину «{name}»?',
    deleteBody: 'Это действие нельзя отменить.',
    deleted: 'Картина удалена',
    deleteFailed: 'Не удалось удалить. Попробуйте ещё раз.',
    photoAlt: 'Фото картины «{name}»',
  },
  gallery: {
    noPhotos: 'Нет фотографий',
    prevPhoto: 'Предыдущее фото',
    nextPhoto: 'Следующее фото',
  },
  form: {
    createTitle: 'Новая картина',
    editTitle: 'Редактирование картины',
    name: 'Название',
    namePlaceholder: 'Например: Закат над рекой',
    nameRequired: 'Введите название',
    photos: 'Фото',
    photosAdd: '+ Добавить фото',
    photosAddAria: 'Добавить фото',
    photosCount: 'Фото: {n}',
    photosCountOf: 'Фото: {n} из {m}',
    photosRemove: 'Удалить фото',
    photosHint: 'Максимум {maxFiles} фотографий. Одно фото — не больше {maxMb} МБ.',
    photosFailed: 'Не удалось загрузить фото. Попробуйте ещё раз.',
    price: 'Цена',
    currencyRUB: '₽ Рубли',
    currencyUSD: '$ Доллары',
    currencyEUR: '€ Евро',
    priceNegative: 'Цена не может быть отрицательной',
    priceInvalid: 'Введите цену числом',
    pricePlaceholder: 'Например: 12 500',
    location: 'Где продаётся',
    locationPick: 'Выбрать место',
    locationAdd: 'Добавить новое место',
    locationRequired: 'Выберите место продажи',
    save: 'Сохранить',
    saved: 'Картина сохранена',
    updated: 'Изменения сохранены',
  },
  location: {
    kindOffline: 'Офлайн',
    kindOnline: 'Онлайн',
    kindOfflinePick: 'Офлайн (адрес)',
    kindOnlinePick: 'Онлайн (сайт)',
    address: 'Адрес',
    site: 'Сайт',
    addressRequired: 'Введите адрес',
    urlInvalid: 'Введите адрес сайта, например https://art.ru',
    done: 'Готово',
    empty: 'Нет мест продажи',
    emptyHint: 'Добавьте место, где продаются картины: галерею, выставку или сайт.',
    addressPlaceholder: 'Например, галерея «Солнце», ул. Тверская, 5',
    sitePlaceholder: 'https://…',
  },
  locations: {
    title: 'Места продажи',
    add: '+ Добавить место',
    new: 'Новое место',
    edit: 'Изменить место',
    added: 'Место добавлено',
    updated: 'Место изменено',
    deleted: 'Место удалено',
    deleteTitle: 'Удалить место?',
    deleteBody: 'Это действие нельзя отменить.',
    inUse: 'Это место используют картины: {list}. Сначала замените место у этих картин.',
    open: 'Открыть',
  },
  owner: {
    title: 'Владелец',
    current: 'Владелец: {username}',
    transfer: 'Передать владельцу',
    explanation:
      'Передайте приложение другому человеку. Новый владелец должен открыть приложение, прежде чем вы сможете передать ему права.',
    usernameLabel: 'Имя пользователя в Telegram',
    usernamePlaceholder: '@username',
    usernameRequired: 'Введите имя пользователя',
    usernameInvalid: 'Имя пользователя — 5–32 символа: латиница, цифры или «_»',
    usernameHint: 'Введите Telegram username нового владельца',
    confirmTitle: 'Передать владельцу @{username}?',
    confirmBody: 'После подтверждения доступ будет ограничен.',
    confirm: 'Передать',
    transferStarted: 'Запрос отправлен. Новый владелец подтвердит при следующем открытии.',
    history: 'История',
    historyEmpty: 'История пуста',
    eventClaim: '{date} — Получен доступ: {name}',
    eventTransferInitiated: '{date} — Передача запущена: {from} → {to}',
    eventTransferConfirmed: '{date} — Передача подтверждена: {from} → {to}',
  },
  denied: {
    title: 'Доступ запрещён',
    body: 'Это приложение принадлежит другому человеку. Если вы считаете, что это ошибка, напишите владельцу в Telegram.',
  },
  expired: {
    title: 'Сессия истекла',
    body: 'Данные безопасности устарели. Нажмите кнопку, чтобы открыть приложение заново.',
    reopen: 'Открыть заново',
  },
} as const;

export type Strings = typeof strings;
export type StringSection = keyof Strings;

/** Typed accessor: `t('home').title` — compile-time checked, no dynamic keys. */
export function t<S extends StringSection>(section: S): Strings[S] {
  return strings[section];
}

/**
 * Formatters for parameterized strings. The templates above (master table §6)
 * stay the source of truth; these only substitute the placeholders.
 */
export const format = {
  photosCount: (n: number, m: number): string =>
    strings.painting.photosCount.replace('{n}', String(n)).replace('{m}', String(m)),
  formPhotosCount: (n: number): string => strings.form.photosCount.replace('{n}', String(n)),
  formPhotosCountOf: (n: number, m: number): string =>
    strings.form.photosCountOf.replace('{n}', String(n)).replace('{m}', String(m)),
  photosHint: (maxFiles: number, maxMb: string): string =>
    strings.form.photosHint.replace('{maxFiles}', String(maxFiles)).replace('{maxMb}', maxMb),
  deletePaintingTitle: (name: string): string =>
    strings.painting.deleteTitle.replace('{name}', name),
  photoAlt: (name: string): string => strings.painting.photoAlt.replace('{name}', name),
  locationsInUse: (list: string): string => strings.locations.inUse.replace('{list}', list),
  ownerCurrent: (username: string): string => strings.owner.current.replace('{username}', username),
  ownerConfirmTitle: (username: string): string =>
    strings.owner.confirmTitle.replace('{username}', username),
  ownerEventClaim: (date: string, name: string): string =>
    strings.owner.eventClaim.replace('{date}', date).replace('{name}', name),
  ownerEventTransferInitiated: (date: string, from: string, to: string): string =>
    strings.owner.eventTransferInitiated
      .replace('{date}', date)
      .replace('{from}', from)
      .replace('{to}', to),
  ownerEventTransferConfirmed: (date: string, from: string, to: string): string =>
    strings.owner.eventTransferConfirmed
      .replace('{date}', date)
      .replace('{from}', from)
      .replace('{to}', to),
};

/** Re-export of the shared Russian error catalog — screens display these verbatim. */
export { apiErrorMessages, apiFieldErrorMessages };
