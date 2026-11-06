"""Gera o manual operacional em PDF e Markdown a partir do mesmo conteúdo."""
from pathlib import Path
import re
from html import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "output/pdf/Manual-Agenda-CRE.pdf"
MD = ROOT / "docs/MANUAL_ADMINISTRADOR.md"
PDF.parent.mkdir(parents=True, exist_ok=True)
MD.parent.mkdir(parents=True, exist_ok=True)

pages = [
    ("Acesso e permissões", [
        ("p", "Guia rápido para o administrador da Coordenadoria Regional de Educação. Use-o para orientar os demais usuários e organizar a utilização dos veículos da regional."),
        ("note", "Acesse: **https://agenda-carros.fly.dev**"),
        ("h", "1. Entrar no sistema"),
        ("steps", [
            "Abra o endereço no computador ou no navegador do celular.",
            "Informe o **Usuário** no formato **nome.sobrenome**, por exemplo, **ana.silva**, e a senha recebida. O acesso atual usa nome de usuário, não o e-mail completo.",
            "Clique em **Entrar na agenda**. Confira seu nome, perfil e regional no menu.",
        ]),
        ("h", "2. Primeiro acesso e senha pessoal"),
        ("p", "Para usuários criados pela tela **Usuários**, o sistema apresenta **Primeiro acesso**. Informe a senha fornecida pelo administrador e escolha uma nova senha. Clique em **Definir minha senha** e entre novamente com a senha pessoal."),
        ("p", "A senha deve ter **8 a 128 caracteres**, com pelo menos uma letra maiúscula, uma minúscula, um número e um caractere especial. Espaço não conta como caractere especial. Para mudar depois, use **Trocar senha** no menu."),
        ("h", "3. O que cada perfil pode fazer"),
        ("table", [
            ["Ação", "Administrador", "Gestor de Agenda", "Consulta"],
            ["Consultar agenda e frota", "Sim", "Sim", "Sim"],
            ["Criar agendamento", "Sim", "Sim", "Não"],
            ["Cancelar agendamento", "Sim", "Não", "Não"],
            ["Cadastrar e editar veículos", "Sim", "Não", "Não"],
            ["Cadastrar e editar usuários/perfis", "Sim", "Não", "Não"],
            ["Desbloquear contas", "Sim", "Não", "Não"],
        ]),
        ("p", "As permissões valem para os dados da própria regional. O Gestor de Agenda também não pode cancelar reservas feitas por ele. Todos podem trocar a própria senha."),
        ("note", "**Três erros consecutivos de senha bloqueiam a conta sem prazo de expiração.** Somente um administrador pode desbloqueá-la. Aguardar ou trocar a senha não remove o bloqueio."),
    ]),
    ("Usuários e veículos", [
        ("h", "4. Cadastrar um usuário"),
        ("steps", [
            "Abra **Usuários** e localize o formulário **Novo usuário**.",
            "Preencha **Nome**, **Usuário** no formato **nome.sobrenome** e uma **Senha** inicial que atenda à regra de segurança. Use letras minúsculas sem acentos, números e pontos no usuário.",
            "Selecione o **Perfil**: Administrador, Gestor de Agenda ou Consulta. Clique em **Criar usuário**.",
            "Informe o endereço do sistema, o usuário e a senha inicial à pessoa por um canal privado. Oriente-a a definir a senha pessoal no primeiro acesso.",
        ]),
        ("h", "5. Editar usuário e recuperar acesso"),
        ("p", "Em **Usuários**, clique em **Editar usuário**. Altere nome, usuário ou perfil e clique em **Salvar alterações**. Para manter a senha atual, deixe **Nova senha** em branco. Para redefini-la, informe uma nova senha forte."),
        ("p", "Alterar usuário, senha ou perfil encerra as sessões dessa conta; a pessoa deverá entrar novamente. Se você alterar suas próprias credenciais ou perfil, também precisará entrar de novo. O sistema impede retirar o perfil do último administrador da regional."),
        ("p", "Se a pessoa esqueceu a senha, o administrador pode redefini-la nessa tela. Depois, oriente a pessoa a usar **Trocar senha** para escolher sua senha pessoal. Se a conta estiver bloqueada, faça também o desbloqueio."),
        ("h", "6. Desbloquear uma conta"),
        ("steps", [
            "Abra **Usuários** e encontre a conta marcada como **Bloqueado**.",
            "Clique em **Desbloquear** e aguarde a confirmação.",
            "Oriente a pessoa a tentar novamente com as credenciais corretas. O desbloqueio não troca a senha e reinicia a contagem de tentativas.",
        ]),
        ("note", "Mantenha pelo menos dois administradores ativos, com contas individuais. Se todos forem bloqueados, procure o responsável técnico pela hospedagem para recuperar o acesso administrativo."),
        ("h", "7. Cadastrar ou editar um veículo"),
        ("p", "Abra **Veículos**. Em **Cadastrar veículo**, preencha o **Nome** e clique em **Cadastrar**. Use um nome claro que permita identificar o carro. A versão atual cadastra apenas o nome, sem campo de placa."),
        ("p", "Para alterar, clique em **Editar veículo**, ajuste o nome e clique em **Salvar alterações**. Use **Cancelar edição** se não quiser salvar. Somente o administrador vê e utiliza essas ações."),
    ]),
    ("Agenda e rotina diária", [
        ("h", "8. Consultar a disponibilidade"),
        ("p", "Abra **Agenda**. Selecione uma data no campo de referência para mostrar a semana correspondente e use **Todos os veículos** para filtrar um carro. A visualização atual mostra **segunda a sexta-feira**."),
        ("p", "Cada reserva apresenta o veículo, os horários, o motivo e quem a cadastrou. Os horários são exibidos no fuso do dispositivo; mantenha data, hora e fuso corretos no computador ou celular. A consulta atualizada e o agendamento exigem internet."),
        ("h", "9. Incluir um agendamento"),
        ("steps", [
            "Na agenda, clique em **+ Agendar viagem**.",
            "Selecione o **Veículo** e informe a data e a hora de **Início** e **Fim**. O fim precisa ser posterior ao início; uma viagem pode terminar em outro dia.",
            "Preencha **Motivo da viagem** com destino e finalidade de forma objetiva.",
            "Confira os dados e clique em **Confirmar agendamento**. Aguarde a mensagem **Viagem agendada** e confira a reserva no calendário.",
        ]),
        ("p", "Administrador e Gestor de Agenda podem criar reservas. Se já houver uma reserva para o mesmo veículo em parte do período, o sistema bloqueia o novo agendamento. Escolha outro horário ou veículo."),
        ("h", "10. Cancelar ou corrigir uma reserva"),
        ("p", "Somente o **Administrador** pode cancelar. Localize a reserva na agenda, clique em **Cancelar** e confirme. A reserva sai da agenda ativa, mas seu histórico permanece armazenado."),
        ("p", "Não há edição direta de reservas nesta versão. Para corrigir carro, horário ou motivo, solicite ao administrador o cancelamento e cadastre novamente os dados corretos. O gestor não pode cancelar nem a própria reserva."),
        ("h", "11. Dúvidas e problemas comuns"),
        ("table", [
            ["Situação", "Como proceder"],
            ["Não aparece um botão", "Confira seu perfil. Usuários e gestão de veículos são exclusivos do administrador."],
            ["Conta bloqueada", "Administrador: Usuários > Desbloquear. Se necessário, redefina a senha também."],
            ["Veículo já reservado", "Escolha outro carro ou período, ou peça ao administrador para avaliar a reserva existente."],
            ["Reserva não aparece", "Confira a semana, o filtro de veículo e os dias exibidos; atualize a página."],
            ["Falha de conexão ou acesso", "Confira a internet, tente novamente e avise o responsável técnico se persistir."],
        ]),
        ("note", "**Ao terminar:** confirme o agendamento salvo, confira a regional exibida no menu e use **Sair da conta** em equipamentos compartilhados. Não compartilhe a conta de administrador."),
    ]),
]

# Markdown editável, sem detalhes de infraestrutura no fluxo operacional.
md = ["# Agenda CRE - Manual rápido do administrador", "", "Versão de referência: 05/11/2026.", ""]
for title, blocks in pages:
    md += [f"## {title}", ""]
    for kind, content in blocks:
        if kind == "h": md += [f"### {content}", ""]
        elif kind in ("p", "note"): md += [("> " if kind == "note" else "") + content, ""]
        elif kind == "steps": md += [f"{i}. {line}" for i, line in enumerate(content, 1)] + [""]
        elif kind == "table":
            md += ["| " + " | ".join(content[0]) + " |", "| " + " | ".join(["---"] * len(content[0])) + " |"]
            md += ["| " + " | ".join(row) + " |" for row in content[1:]] + [""]
MD.write_text("\n".join(md), encoding="utf-8")

fontdir = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Manual", str(fontdir / "segoeui.ttf")))
pdfmetrics.registerFont(TTFont("ManualBold", str(fontdir / "segoeuib.ttf")))
pdfmetrics.registerFontFamily("Manual", normal="Manual", bold="ManualBold")
green = colors.HexColor("#155e52")
ink = colors.HexColor("#243e37")
muted = colors.HexColor("#62766d")
base = ParagraphStyle("Body", fontName="Manual", fontSize=9.6, leading=13.6, textColor=ink, spaceAfter=6)
heading = ParagraphStyle("Heading", parent=base, fontName="ManualBold", fontSize=11.2, leading=15, textColor=green, spaceBefore=9, spaceAfter=6, keepWithNext=True)
tablebody = ParagraphStyle("TableBody", parent=base, fontSize=8.6, leading=11.7, spaceAfter=0)
tablehead = ParagraphStyle("TableHead", parent=tablebody, fontName="ManualBold", textColor=colors.white)
notestyle = ParagraphStyle("Note", parent=base, fontSize=9.2, leading=13, spaceAfter=0)

def fmt(text):
    text = re.sub(r"\*\*(.+?)\*\*", lambda m: "<b>" + escape(m.group(1)) + "</b>", text)
    # Escape only plain spans so generated bold markup remains intact.
    parts = re.split(r"(<b>.*?</b>)", text)
    return "".join(p if p.startswith("<b>") else escape(p) for p in parts)

width = A4[0] - 88
story = []
for number, (title, blocks) in enumerate(pages, 1):
    if number > 1: story.append(PageBreak())
    for kind, content in blocks:
        if kind == "h": story.append(Paragraph(fmt(content), heading))
        elif kind == "p": story.append(Paragraph(fmt(content), base))
        elif kind == "steps":
            for i, line in enumerate(content, 1):
                story.append(Paragraph(f"<b>{i}.</b> " + fmt(line), base))
        elif kind == "note":
            box = Table([[Paragraph(fmt(content), notestyle)]], colWidths=[width])
            box.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#edf4ef")), ("BOX", (0,0), (-1,-1), .5, colors.HexColor("#dce8df")), ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10), ("TOPPADDING", (0,0), (-1,-1), 9), ("BOTTOMPADDING", (0,0), (-1,-1), 9)]))
            story += [Spacer(1, 4), box, Spacer(1, 5)]
        elif kind == "table":
            data = [[Paragraph(fmt(cell), tablehead if idx == 0 else tablebody) for cell in row] for idx, row in enumerate(content)]
            cols = [width*.44, width*.2, width*.21, width*.15] if len(content[0]) == 4 else [width*.29, width*.71]
            t = Table(data, colWidths=cols, repeatRows=1, hAlign="LEFT")
            t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), green), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f2f6f3")]), ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6), ("LINEBELOW", (0,-1), (-1,-1), .5, colors.HexColor("#dce8df"))]))
            story += [t, Spacer(1, 8)]

def decorate(c, doc):
    p = doc.page
    c.saveState()
    c.setFillColor(green)
    c.rect(0, A4[1]-8, A4[0], 8, fill=1, stroke=0)
    c.setFont("ManualBold", 10)
    c.drawString(44, A4[1]-34, "AGENDA CRE")
    c.setFillColor(muted)
    c.setFont("Manual", 8)
    c.drawRightString(A4[0]-44, A4[1]-34, "MANUAL RÁPIDO DO ADMINISTRADOR")
    c.setFillColor(ink)
    c.setFont("ManualBold", 21)
    c.drawString(44, A4[1]-67, pages[p-1][0] if p <= len(pages) else "Continuação")
    c.setStrokeColor(colors.HexColor("#dce8df"))
    c.line(44, 39, A4[0]-44, 39)
    c.setFillColor(muted)
    c.setFont("Manual", 8)
    c.drawString(44, 25, "Referência: 05/11/2026 | agenda-carros.fly.dev")
    c.drawRightString(A4[0]-44, 25, f"{p} / 3")
    c.restoreState()

doc = SimpleDocTemplate(str(PDF), pagesize=A4, leftMargin=44, rightMargin=44, topMargin=87, bottomMargin=52, title="Agenda CRE - Manual rápido do administrador", author="Agenda CRE")
doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
print(PDF)
print(MD)
