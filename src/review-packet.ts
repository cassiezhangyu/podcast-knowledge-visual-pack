type R = Record<string, any>;
/** 审核包与渲染清单匹配用的页号：优先 manifest_page_id（渲染清单页号），兼容只有 page_id 的旧包。 */
export const packetPageId = (packet: R): string => String(packet.manifest_page_id ?? packet.page_id);
