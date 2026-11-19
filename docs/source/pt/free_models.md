<!--Copyright 2025 The HuggingFace Team. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.

⚠️ Note that this file is in Markdown but contain specific syntax for our doc-builder (similar to MDX) that may not be
rendered properly in your Markdown viewer.

-->

# Modelos grátis disponíveis

Nem todo checkpoint do [Hugging Face Hub](https://huggingface.co/models) pode ser baixado livremente: alguns exigem
aprovação do autor (repositórios *gated*) ou vêm com licenças de uso restrito. Este guia mostra como descobrir, a partir
deste próprio checkout do Transformers, **quais arquiteturas são suportadas** e **quais checkpoints são grátis** para
cada uma delas.

O script usado aqui é o [`utils/list_models.py`](https://github.com/huggingface/transformers/blob/main/utils/list_models.py).
Ele usa apenas a biblioteca padrão do Python, então roda sem instalar o `transformers` e sem GPU.

## Instalação e download

Escolha o modelo e o framework de sua preferência. Todos os exemplos abaixo instalam o PyTorch:

```bash
pip install transformers torch
```

Para baixar um checkpoint, `from_pretrained` cuida de tudo. O download vai para o cache local (`~/.cache/huggingface`)
e fica disponível offline depois:

```py
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "Qwen/Qwen3-0.6B"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id)
```

> [!TIP]
> Prefira checkpoints **não gated** e com licença permissiva (Apache-2.0, MIT, BSD, CC-BY...). Eles não exigem login,
> não pedem aprovação e podem ser usados comercialmente sem contato com o autor. Repositórios *gated* exigem um token
> (`hf auth login`) e a aprovação do dono do repositório, que pode demorar ou nunca acontecer.

## Quais arquiteturas este checkout suporta

Cada arquitetura documentada em `docs/source/en/_toctree.yml` aparece agrupada por modalidade:

```bash
python utils/list_models.py --list                          # todas
python utils/list_models.py --list --modality text           # só LLMs/encoders de texto
python utils/list_models.py --list --modality multimodal     # VLMs, OCR, áudio+texto...
python utils/list_models.py --list --show-tasks --csv catalogo.csv
```

No estado atual do repositório (v5.24.0.dev0) são **555 arquiteturas**, distribuídas assim:

| Modalidade | Arquiteturas |
|---|---|
| Texto | 236 |
| Multimodal (imagem/vídeo/áudio + texto) | 165 |
| Visão | 80 |
| Áudio | 65 |
| Vídeo | 8 |
| Aprendizado por reforço | 1 |

Para saber o que dá para fazer com cada arquitetura, `--tasks` imprime o mapeamento entre classes
`AutoModelFor*` e arquiteturas, lido direto de `src/transformers/models/auto/modeling_auto.py`:

```bash
python utils/list_models.py --tasks --tasks-filter generation
python utils/list_models.py --tasks --tasks-filter "speech"
```

## Como encontrar os modelos grátis

O modo `--hub` consulta a API do Hub e classifica cada checkpoint:

- **FREE** — sem *gate* e com licença permissiva (`apache-2.0`, `mit`, `bsd-3-clause`, `cc-by-4.0`, `openrail`...), ou
  sem licença declarada em um repositório com downloads: dá para baixar e usar agora;
- **CHECK** — sem *gate*, mas com licença que impõe condições de uso, como `cc-by-nc-4.0` (proíbe uso comercial) ou as
  licenças de família `gemma`/`llama3`/`qwen` (permitem uso, com termos extras). O download é livre, mas leia o cartão
  do modelo antes de usar comercialmente;
- **GATED** — exige aprovação do autor; aparece só com `--include-gated`.

```bash
# Os 10 checkpoints mais baixados de cada arquitetura multimodal, ordenados por downloads
python utils/list_models.py --hub --modality multimodal --limit 10

# Só licenças Apache-2.0, exportando para CSV
python utils/list_models.py --hub --architectures qwen3 llama gemma3 --license apache-2.0 --csv livres.csv

# Filtrar por tarefa e por pipeline oficial do Hub
python utils/list_models.py --hub --tasks-filter "Speech recognition" --pipeline-tag automatic-speech-recognition
```

Exemplo de saída (`--hub --architectures qwen3 --limit 3`):

```text
ACCESS  MODEL                              ARCH    LICENSE      DL        LIKES  UPDATED
FREE    Qwen/Qwen3-0.6B                    qwen3   apache-2.0   1234567   890    2025-11-01
FREE    Qwen/Qwen3-8B                      qwen3   apache-2.0   987654    432    2025-10-30
CHECK   Qwen/Qwen3-30B-A3B                 qwen3   qwen         456789    210    2025-10-12
```

> [!NOTE]
> A classificação é um filtro de conveniência, não um parecer jurídico: confira sempre a licença no cartão do modelo
> antes de usar comercialmente. Repositórios *gated* também podem ser gratuitos, mas dependem de aprovação manual do
> autor — o script os esconde por padrão justamente porque o acesso não é imediato.

## Sugestões de modelos grátis por tarefa

A tabela abaixo é um ponto de partida prático. Troque os IDs pelas versões que o `--hub` listar, que sempre refletem o
que existe hoje no Hub.

| Tarefa | Arquiteturas | Checkpoints gratuitos para começar |
|---|---|---|
| Chat/geração de texto | `qwen3`, `llama`, `gemma3`, `mistral`, `smollm3` | `Qwen/Qwen3-0.6B`, `Qwen/Qwen3-8B`, `google/gemma-3-4b-it`, `HuggingFaceTB/SmolLM3-3B` |
| Classificação / NER / QA | `bert`, `roberta`, `deberta-v2`, `xlm-roberta` | `google-bert/bert-base-multilingual-cased`, `FacebookAI/xlm-roberta-base` |
| Embeddings para RAG | `bert`, `nomic_bert`, `gte`, `mpnet` | `nomic-ai/nomic-embed-text-v1.5`, `BAAI/bge-m3` |
| Imagem + texto (VLM) | `llava`, `qwen2_5_vl`, `qwen3_vl`, `gemma3`, `smolvlm` | `Qwen/Qwen2.5-VL-3B-Instruct`, `HuggingFaceTB/SmolVLM-256M-Instruct` |
| OCR / documentos | `trocr`, `donut`, `glm_ocr`, `qwen2_5_vl` | `microsoft/trocr-base-printed`, `naver-clova-ix/donut-base` |
| Detecção / segmentação | `detr`, `yolos`, `mask2former`, `sam` | `facebook/detr-resnet-50`, `facebook/sam-vit-base` |
| Profundidade | `depth_anything`, `dpt` | `Intel/dpt-hybrid-midas` |
| Fala → texto (ASR) | `whisper`, `wav2vec2`, `parakeet`, `moonshine` | `openai/whisper-small`, `openai/whisper-large-v3-turbo` |
| Texto → fala / música | `vits`, `speecht5`, `bark`, `musicgen` | `facebook/musicgen-small`, `suno/bark-small` |
| Vídeo | `videomae`, `vivit`, `vjepa2` | `MCG-NJU/videomae-base` |

> [!WARNING]
> Modelos muito grandes (ex.: `llama-3.3-70b`, `qwen3-235b`) também são gratuitos, mas exigem hardware proporcional:
> quantização (bitsandbytes, GPTQ, AWQ) ou `device_map="auto"` com `accelerate`. Comece pelos modelos pequenos e vá
> aumentando.

## Filtrando direto no site

Se preferir a interface web, o Hub aceita os mesmos filtros: abra <https://huggingface.co/models>, escolha a tarefa em
*Tasks*, a biblioteca **Transformers** e, em *License*, marque `apache-2.0`/`mit`. O parâmetro `gated=false` no painel
lateral esconde os repositórios que pedem aprovação.
