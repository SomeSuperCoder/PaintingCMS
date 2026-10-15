/**
 * RU strings contract — hardcoded per spec (deliberately NOT imported from
 * the app, so a string regression fails the suite instead of passing).
 * Sources: openspec/changes/painting-cms/specs + apps/web/src/strings/index.ts.
 */
export const S = {
  homeTitle: 'Мои картины',
  // Bottom bar: the "+" comes from a <PlusIcon aria-hidden>, which contributes
  // nothing to the accessible name — so the label itself carries no plus.
  addButton: 'Добавить картину',
  addFirst: '+ Добавить первую картину',
  emptyCatalog: 'У вас пока нет картин',

  formCreateTitle: 'Новая картина',
  formEditTitle: 'Редактирование картины',
  formNameLabel: 'Название',
  formPriceLabel: 'Цена',
  currencyUsd: '$ Доллары',
  currencyRub: '₽ Рубли',
  savedToast: 'Картина сохранена',
  updatedToast: 'Изменения сохранены',
  deletedToast: 'Картина удалена',

  locationPick: 'Выбрать место',
  locationAdd: 'Добавить новое место',
  kindOffline: 'Офлайн',
  kindOnline: 'Онлайн',
  onlinePick: 'Онлайн (сайт)',
  locationDone: 'Готово',
  addressLabel: 'Адрес',
  addressPlaceholder: 'Например, галерея «Солнце», ул. Тверская, 5',
  sitePlaceholder: 'https://…',

  locationsTitle: 'Места продажи',
  locationsAdd: '+ Добавить место',
  locationsNew: 'Новое место',
  locationAddedToast: 'Место добавлено',
  locationDeletedToast: 'Место удалено',
  locationDeleteTitle: 'Удалить место?',

  editButton: 'Изменить',
  deleteButton: 'Удалить',
  save: 'Сохранить',
  cancel: 'Отмена',
  ok: 'Понятно',
  back: 'Назад',
  openSite: 'Открыть сайт',

  ownerTitle: 'Владелец',
  ownerTransfer: 'Передать владельцу',
  confirmTransfer: 'Передать',
  usernameLabel: 'Имя пользователя в Telegram',
  transferStarted: 'Запрос отправлен. Новый владелец подтвердит при следующем открытии.',

  deniedTitle: 'Доступ запрещён',
  expiredTitle: 'Сессия истекла',
  expiredReopen: 'Открыть заново',

  photoAlt: (name: string) => `Фото картины «${name}»`,
  photosCountOf: (n: number, m = 10) => `Фото: ${n} из ${m}`,
  deleteTitle: (name: string) => `Удалить картину «${name}»?`,
  confirmTitle: (username: string) => `Передать владельцу @${username}?`,
  ownerBadge: (username: string) => `Владелец: @${username}`,
  locationInUsePrefix: 'Это место используют картины:',
} as const;
