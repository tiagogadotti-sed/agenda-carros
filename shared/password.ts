export const PASSWORD_MESSAGE =
  "A senha deve ter de 8 a 128 caracteres, com maiúscula, minúscula, número e caractere especial (espaço não conta).";
export const PASSWORD_PATTERN = String.raw`(?=.*\p{Lu})(?=.*\p{Ll})(?=.*[0-9])(?=.*[^\p{L}\p{N}\s]).{8,128}`;
const passwordRule = new RegExp(`^(?:${PASSWORD_PATTERN})$`, "u");
export const isStrongPassword = (value: string) => passwordRule.test(value);
