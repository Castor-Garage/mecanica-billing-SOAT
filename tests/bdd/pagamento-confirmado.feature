# language: pt
Funcionalidade: Confirmação de pagamento via Stripe
  Como o sistema de billing
  Quero processar o webhook checkout.session.completed do Stripe
  Para confirmar o pagamento e publicar o evento PagamentoConfirmado

  Contexto:
    Dado que existe um pagamento com status PENDENTE na base de dados
    E o serviço do Stripe CLI está encaminhando eventos para localhost:3000

  Cenário: Pagamento aprovado pelo Stripe
    Dado que o Stripe processa o pagamento da sessão de checkout
    Quando o Stripe envia o evento "checkout.session.completed" para POST /webhooks/stripe
    Então o sistema confirma o pagamento na base de dados
    E o status do pagamento passa para CONFIRMADO
    E o evento "PagamentoConfirmado" é publicado na fila os-events

  Cenário: Sessão de checkout expirada
    Dado que o cliente não completou o pagamento dentro do prazo
    Quando o Stripe envia o evento "checkout.session.expired" para POST /webhooks/stripe
    Então o sistema falha o pagamento na base de dados
    E o status do pagamento passa para FALHOU
    E o evento "PagamentoFalhou" é publicado na fila os-events

  Cenário: Webhook com assinatura inválida
    Dado que um agente externo tenta simular um evento do Stripe
    Quando envia um POST /webhooks/stripe sem o header stripe-signature válido
    Então o sistema rejeita a requisição com status 400
    E nenhum pagamento é alterado na base de dados

  Cenário: Webhook duplicado (idempotência)
    Dado que o pagamento já foi confirmado anteriormente
    Quando o Stripe reenvia o evento "checkout.session.completed" para o mesmo pagamento
    Então o sistema ignora o evento sem retornar erro
    E responde com status 200
