export function getHostContext(host) {
  return host.SillyTavern?.getContext?.() ?? {};
}

export function getChatIdentity(context) {
  const previousChatId = context.chatId ?? context.chatMetadata?.chat_id;
  const chatId = context.getCurrentChatId?.() || previousChatId || '';
  const characterId = context.characterId ?? context.character_id;
  const character = context.characters?.[characterId];
  const characterKey = character?.avatar || (characterId ?? context.name2 ?? '');
  const groupId = context.groupId ?? context.group_id;
  const owner = groupId != null && groupId !== ''
    ? `group:${groupId}`
    : characterKey !== '' ? `character:${characterKey}` : '';
  return {
    scope: chatId && owner ? JSON.stringify([owner, String(chatId)]) : '',
    owner,
    chatId: String(chatId),
    legacyScope: previousChatId
      ? `${characterId ?? context.name2 ?? ''}::${previousChatId}`
      : '',
    legacyUiScope: previousChatId ? JSON.stringify([characterId, previousChatId]) : '',
  };
}
