# Agenda CRE - Manual rápido do administrador

Versão de referência: 05/11/2026.

## Acesso e permissões

Guia rápido para o administrador da Coordenadoria Regional de Educação. Use-o para orientar os demais usuários e organizar a utilização dos veículos da regional.

> Acesse: **https://agenda-carros.fly.dev**

### 1. Entrar no sistema

1. Abra o endereço no computador ou no navegador do celular.
2. Informe o **Usuário** no formato **nome.sobrenome**, por exemplo, **ana.silva**, e a senha recebida. O acesso atual usa nome de usuário, não o e-mail completo.
3. Clique em **Entrar na agenda**. Confira seu nome, perfil e regional no menu.

### 2. Primeiro acesso e senha pessoal

Para usuários criados pela tela **Usuários**, o sistema apresenta **Primeiro acesso**. Informe a senha fornecida pelo administrador e escolha uma nova senha. Clique em **Definir minha senha** e entre novamente com a senha pessoal.

A senha deve ter **8 a 128 caracteres**, com pelo menos uma letra maiúscula, uma minúscula, um número e um caractere especial. Espaço não conta como caractere especial. Para mudar depois, use **Trocar senha** no menu.

### 3. O que cada perfil pode fazer

| Ação | Administrador | Gestor de Agenda | Consulta |
| --- | --- | --- | --- |
| Consultar agenda e frota | Sim | Sim | Sim |
| Criar agendamento | Sim | Sim | Não |
| Cancelar agendamento | Sim | Não | Não |
| Cadastrar e editar veículos | Sim | Não | Não |
| Cadastrar e editar usuários/perfis | Sim | Não | Não |
| Desbloquear contas | Sim | Não | Não |

As permissões valem para os dados da própria regional. O Gestor de Agenda também não pode cancelar reservas feitas por ele. Todos podem trocar a própria senha.

> **Três erros consecutivos de senha bloqueiam a conta sem prazo de expiração.** Somente um administrador pode desbloqueá-la. Aguardar ou trocar a senha não remove o bloqueio.

## Usuários e veículos

### 4. Cadastrar um usuário

1. Abra **Usuários** e localize o formulário **Novo usuário**.
2. Preencha **Nome**, **Usuário** no formato **nome.sobrenome** e uma **Senha** inicial que atenda à regra de segurança. Use letras minúsculas sem acentos, números e pontos no usuário.
3. Selecione o **Perfil**: Administrador, Gestor de Agenda ou Consulta. Clique em **Criar usuário**.
4. Informe o endereço do sistema, o usuário e a senha inicial à pessoa por um canal privado. Oriente-a a definir a senha pessoal no primeiro acesso.

### 5. Editar usuário e recuperar acesso

Em **Usuários**, clique em **Editar usuário**. Altere nome, usuário ou perfil e clique em **Salvar alterações**. Para manter a senha atual, deixe **Nova senha** em branco. Para redefini-la, informe uma nova senha forte.

Alterar usuário, senha ou perfil encerra as sessões dessa conta; a pessoa deverá entrar novamente. Se você alterar suas próprias credenciais ou perfil, também precisará entrar de novo. O sistema impede retirar o perfil do último administrador da regional.

Se a pessoa esqueceu a senha, o administrador pode redefini-la nessa tela. Depois, oriente a pessoa a usar **Trocar senha** para escolher sua senha pessoal. Se a conta estiver bloqueada, faça também o desbloqueio.

### 6. Desbloquear uma conta

1. Abra **Usuários** e encontre a conta marcada como **Bloqueado**.
2. Clique em **Desbloquear** e aguarde a confirmação.
3. Oriente a pessoa a tentar novamente com as credenciais corretas. O desbloqueio não troca a senha e reinicia a contagem de tentativas.

> Mantenha pelo menos dois administradores ativos, com contas individuais. Se todos forem bloqueados, procure o responsável técnico pela hospedagem para recuperar o acesso administrativo.

### 7. Cadastrar ou editar um veículo

Abra **Veículos**. Em **Cadastrar veículo**, preencha o **Nome** e clique em **Cadastrar**. Use um nome claro que permita identificar o carro. A versão atual cadastra apenas o nome, sem campo de placa.

Para alterar, clique em **Editar veículo**, ajuste o nome e clique em **Salvar alterações**. Use **Cancelar edição** se não quiser salvar. Somente o administrador vê e utiliza essas ações.

## Agenda e rotina diária

### 8. Consultar a disponibilidade

Abra **Agenda**. Selecione uma data no campo de referência para mostrar a semana correspondente e use **Todos os veículos** para filtrar um carro. A visualização atual mostra **segunda a sexta-feira**.

Cada reserva apresenta o veículo, os horários, o motivo e quem a cadastrou. Os horários são exibidos no fuso do dispositivo; mantenha data, hora e fuso corretos no computador ou celular. A consulta atualizada e o agendamento exigem internet.

### 9. Incluir um agendamento

1. Na agenda, clique em **+ Agendar viagem**.
2. Selecione o **Veículo** e informe a data e a hora de **Início** e **Fim**. O fim precisa ser posterior ao início; uma viagem pode terminar em outro dia.
3. Preencha **Motivo da viagem** com destino e finalidade de forma objetiva.
4. Confira os dados e clique em **Confirmar agendamento**. Aguarde a mensagem **Viagem agendada** e confira a reserva no calendário.

Administrador e Gestor de Agenda podem criar reservas. Se já houver uma reserva para o mesmo veículo em parte do período, o sistema bloqueia o novo agendamento. Escolha outro horário ou veículo.

### 10. Cancelar ou corrigir uma reserva

Somente o **Administrador** pode cancelar. Localize a reserva na agenda, clique em **Cancelar** e confirme. A reserva sai da agenda ativa, mas seu histórico permanece armazenado.

Não há edição direta de reservas nesta versão. Para corrigir carro, horário ou motivo, solicite ao administrador o cancelamento e cadastre novamente os dados corretos. O gestor não pode cancelar nem a própria reserva.

### 11. Dúvidas e problemas comuns

| Situação | Como proceder |
| --- | --- |
| Não aparece um botão | Confira seu perfil. Usuários e gestão de veículos são exclusivos do administrador. |
| Conta bloqueada | Administrador: Usuários > Desbloquear. Se necessário, redefina a senha também. |
| Veículo já reservado | Escolha outro carro ou período, ou peça ao administrador para avaliar a reserva existente. |
| Reserva não aparece | Confira a semana, o filtro de veículo e os dias exibidos; atualize a página. |
| Falha de conexão ou acesso | Confira a internet, tente novamente e avise o responsável técnico se persistir. |

> **Ao terminar:** confirme o agendamento salvo, confira a regional exibida no menu e use **Sair da conta** em equipamentos compartilhados. Não compartilhe a conta de administrador.
