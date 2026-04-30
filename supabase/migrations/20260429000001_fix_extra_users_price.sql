-- Corrige preço do usuário adicional: era R$ 29,90 (2990 cents), correto é R$ 59,90 (5990 cents)
UPDATE plans
SET user_price_cents = 5990
WHERE user_price_cents = 2990;
