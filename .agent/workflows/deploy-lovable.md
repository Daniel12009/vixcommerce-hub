---
description: Como fazer deploy no Lovable (push para o repositório correto)
---

# Deploy no Lovable

O projeto VixCommerce Hub está hospedado no **Lovable** e conectado ao GitHub.

## Repositório correto

O Lovable está conectado ao repositório:
- **Remote name:** `lovable-old`
- **URL:** `https://github.com/Daniel12009/vixcommerce-hub-7da1c930.git`
- **App URL:** `https://painel-fix.lovable.app`

## Outros remotes (NÃO usados pelo Lovable para deploy)

- `origin` → `Daniel12009/vixcommerce-hub.git` (backup principal no GitHub)
- `lovable2` → `Daniel12009/vixcommerce-hub-import-04c8050d.git` (antigo)
- `lovable3` → `Daniel12009/git-import-hub.git` (antigo)

## Workflow de deploy

// turbo-all

1. Fazer as alterações nos arquivos do projeto

2. Fazer commit das alterações:
```powershell
git add .; git commit -m "descricao da alteracao"
```

3. Push para o remote do Lovable:
```powershell
git push lovable-old main
```

4. Push para o origin (backup):
```powershell
git push origin main
```

5. No Lovable (lovable.dev), clicar em **Pull** para puxar as alterações e depois **Publish** para fazer o deploy.

## Importante

- **SEMPRE** usar `lovable-old` como remote para o Lovable
- O push para `origin` é opcional (backup), mas recomendado
- Após o push, o usuário precisa fazer Pull + Publish no painel do Lovable
