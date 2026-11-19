# Modelos grátis que aceitam vídeo (e outras entradas)

Este guia cobre modelos que recebem **vídeo como entrada** — arquivo `.mp4`, URL, lista de frames — e responde com texto,
classificação, detecção/rastreamento de objetos ou embeddings. Todos os exemplos são de modelos **grátis** (sem *gate* e
com licença permissiva) e existem como checkpoints abertos no Hugging Face Hub.

Os nomes de arquitetura (entre crases) são os *slugs* de configuração do Transformers, ou seja, o que você passa em
`model_type`/o que o `AutoModelFor*` reconhece. Eles podem ser conferidos neste checkout com:

```bash
python utils/list_models.py --list --video            # só arquiteturas que aceitam vídeo
python utils/list_models.py --list --video --show-tasks
```

> [!NOTE]
> **Este ambiente não tem acesso de rede ao `huggingface.co`**, então os IDs abaixo foram escolhidos entre checkpoints
> públicos e permissivos conhecidos, e os tamanhos são aproximados. Antes de treinar/fazer deploy, confirme a licença e a
> disponibilidade no cartão do modelo, ou rode
> `python utils/list_models.py --hub --architectures qwen2_5_vl --limit 10` numa máquina com internet para ver a lista
> atualizada direto do Hub.

## O que conta como "aceitar vídeo"

Um modelo aceita vídeo quando tem um video processor próprio (`video_processing_*.py`, que herda de
`BaseVideoProcessor`), quando o processor dele constrói um `video_processor`, ou quando declara `"video"` em
`input_modalities`. O script detecta isso automaticamente:

```bash
$ python utils/list_models.py --list --video
Model architectures supported by this checkout (59 of 555)
```

São **59 arquiteturas**, entre elas: `qwen2_vl`, `qwen2_5_vl`, `qwen3_vl`, `qwen3_vl_moe`, `llava_next_video`,
`llava_onevision`, `video_llava`, `video_llama_3`, `instructblipvideo`, `smolvlm`, `internvl`, `minicpmv4_6`,
`minicpmv4_7`, `glm4v`, `glm46v`, `molmo2`, `qwen2_5_omni`, `qwen3_omni_moe`, `gemma4`, `gemma4_unified`, `kimi_k25`,
`cosmos3_edge`, `perception_lm`, `x_clip`, `videomae`, `vivit`, `timesformer`, `vjepa2`, `videoprism`, `sam2_video`,
`sam3_video`, `pe_video`, `videomt`, `tvp`.

## Tabela de modelos grátis que aceitam vídeo

| Checkpoint (Hub) | Arquitetura | Tamanho | Licença | O que faz com o vídeo |
|---|---|---|---|---|
| [`Qwen/Qwen2.5-VL-3B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct) | `qwen2_5_vl` | 3B | Apache-2.0 | Chat sobre vídeo: descrever, resumir, Q&A, localizar eventos no tempo |
| [`Qwen/Qwen2.5-VL-7B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct) | `qwen2_5_vl` | 7B | Apache-2.0 | Mesmo, com mais qualidade (precisa de ~16 GB em bf16) |
| [`Qwen/Qwen3-VL-4B-Instruct`](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct) | `qwen3_vl` | 4B | Apache-2.0 | Geração mais nova: vídeo longo, timestamps, OCR em vídeo |
| [`Qwen/Qwen3-VL-8B-Instruct`](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | `qwen3_vl` | 8B | Apache-2.0 | Mesmo, mais capaz |
| [`HuggingFaceTB/SmolVLM2-2.2B-Instruct`](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct) | `smolvlm` | 2.2B | Apache-2.0 | VLM pequeno para vídeo/imagem, ótimo para rodar local |
| [`HuggingFaceTB/SmolVLM2-256M-Video-Instruct`](https://huggingface.co/HuggingFaceTB/SmolVLM2-256M-Video-Instruct) | `smolvlm` | 256M | Apache-2.0 | Versão minúscula, roda em CPU |
| [`llava-hf/LLaVA-NeXT-Video-7B-hf`](https://huggingface.co/llava-hf/LLaVA-NeXT-Video-7B-hf) | `llava_next_video` | 7B | Apache-2.0 | Chat sobre vídeo (LLaVA-NeXT Video) |
| [`llava-hf/LLaVA-OneVision-7B-hf`](https://huggingface.co/llava-hf/LLaVA-OneVision-7B-hf) | `llava_onevision` | 7B | Apache-2.0 | Imagem + vídeo + multi-imagem num só modelo |
| [`LanguageBind/Video-LLaVA-7B-hf`](https://huggingface.co/LanguageBind/Video-LLaVA-7B-hf) | `video_llava` | 7B | Apache-2.0 | Chat sobre vídeo (Video-LLaVA) |
| [`microsoft/Florence-2-large`](https://huggingface.co/microsoft/Florence-2-large) | `florence2` | 0.77B | MIT | Legendas, detecção, OCR e segmentação guiada por texto |
| [`MCG-NJU/videomae-base`](https://huggingface.co/MCG-NJU/videomae-base) | `videomae` | 87M | CC-BY-NC-4.0¹ | Classificação de ação em vídeo (backbone de features) |
| [`facebook/timesformer-base-finetuned-k400`](https://huggingface.co/facebook/timesformer-base-finetuned-k400) | `timesformer` | 121M | Apache-2.0 | Classificação de ação (Kinetics-400) |
| [`facebook/vjepa2-vitl-fpc64-256`](https://huggingface.co/facebook/vjepa2-vitl-fpc64-256) | `vjepa2` | 300M | Apache-2.0 | Embeddings auto-supervisionados de vídeo (features) |
| [`google/vivit-b-16x2-kinetics400`](https://huggingface.co/google/vivit-b-16x2-kinetics400) | `vivit` | 90M | Apache-2.0 | Classificação de ação (ViViT) |
| [`microsoft/xclip-base-patch32`](https://huggingface.co/microsoft/xclip-base-patch32) | `x_clip` | 150M | MIT | Alinhamento vídeo↔texto (busca, zero-shot) |
| [`facebook/sam2.1-hiera-tiny`](https://huggingface.co/facebook/sam2.1-hiera-tiny) | `sam2_video` | 39M | Apache-2.0 | Segmentação e rastreamento de objetos em vídeo |
| [`OpenGVLab/InternVL3-2B`](https://huggingface.co/OpenGVLab/InternVL3-2B) | `internvl` | 2B | Apache-2.0 | Chat sobre vídeo/imagem |
| [`openbmb/MiniCPM-V-2_6`](https://huggingface.co/openbmb/MiniCPM-V-2_6) | `minicpmv4_6` | 8B | Apache-2.0 | Chat sobre vídeo (bom em OCR de vídeo) |
| [`zai-org/GLM-4.1V-9B-Thinking`](https://huggingface.co/zai-org/GLM-4.1V-9B-Thinking) | `glm4v` | 9B | MIT | Raciocínio sobre vídeo |
| [`Qwen/Qwen2.5-Omni-3B`](https://huggingface.co/Qwen/Qwen2.5-Omni-3B) | `qwen2_5_omni` | 3B | Apache-2.0 | Entrada de vídeo **+ áudio + texto**, saída texto e fala |
| [`Qwen/Qwen3-Omni-30B-A3B-Instruct`](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct) | `qwen3_omni_moe` | 30B (3B ativos) | Apache-2.0 | Omni: vídeo, áudio, imagem e texto |

¹ `videomae` usa CC-BY-NC-4.0 nos checkpoints oficiais (uso não comercial). Para uso comercial, prefira `timesformer`,
`vivit` ou `vjepa2`.

## Exemplos de uso

### Vídeo → texto (Qwen2.5-VL)

```bash
pip install "transformers>=4.52" torch accelerate av
```

```py
from transformers import AutoModelForImageTextToText, AutoProcessor

model_id = "Qwen/Qwen2.5-VL-3B-Instruct"
processor = AutoProcessor.from_pretrained(model_id)
model = AutoModelForImageTextToText.from_pretrained(model_id, dtype="auto", device_map="auto")

messages = [
    {
        "role": "user",
        "content": [
            {"type": "video", "video": "meu_video.mp4"},  # caminho local ou URL
            {"type": "text", "text": "Descreva o que acontece neste vídeo em 3 frases."},
        ],
    }
]
inputs = processor.apply_chat_template(
    messages, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt"
).to(model.device)

out = model.generate(**inputs, max_new_tokens=256)
print(processor.batch_decode(out, skip_special_tokens=True)[0])
```

Sem o pacote `av`/`decord` instalado, você pode extrair os frames antes e passar uma lista de imagens
(`{"type": "video", "video": [frame1, frame2, ...]}`) — o processador aceita frames já decodificados.

### Vídeo → texto em CPU, modelo pequeno (SmolVLM2)

```py
from transformers import AutoModelForImageTextToText, AutoProcessor

model_id = "HuggingFaceTB/SmolVLM2-256M-Video-Instruct"
processor = AutoProcessor.from_pretrained(model_id)
model = AutoModelForImageTextToText.from_pretrained(model_id)

messages = [{"role": "user", "content": [{"type": "video", "path": "meu_video.mp4"}, {"type": "text", "text": "O que está acontecendo?"}]}]
inputs = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt")
print(processor.batch_decode(model.generate(**inputs, max_new_tokens=128), skip_special_tokens=True)[0])
```

### Classificação de ação em vídeo (pipeline)

```py
from transformers import pipeline

clf = pipeline("video-classification", model="facebook/timesformer-base-finetuned-k400")
print(clf("meu_video.mp4", top_k=3))
```

### Rastreamento/segmentação em vídeo (SAM 2.1)

```py
from transformers import Sam2VideoModel, Sam2VideoProcessor
from transformers.video_utils import load_video

model = Sam2VideoModel.from_pretrained("facebook/sam2.1-hiera-tiny", device_map="auto")
processor = Sam2VideoProcessor.from_pretrained("facebook/sam2.1-hiera-tiny")

frames, _ = load_video("meu_video.mp4")
session = processor.init_video_session(video=frames, inference_device=model.device)

# clique no objeto no primeiro frame
processor.add_inputs_to_inference_session(
    inference_session=session, frame_idx=0, obj_ids=1, input_points=[[[[210, 350]]]], input_labels=[[[1]]]
)
model(inference_session=session, frame_idx=0)

# propaga a máscara por todos os frames
for out in model.propagate_in_video_iterator(session):
    masks = processor.post_process_masks([out.pred_masks], original_sizes=[[session.video_height, session.video_width]])
```

## Como escolher

| Se você quer... | Use |
|---|---|
| Descrever/perguntar sobre um vídeo (chat) | `qwen2_5_vl`, `qwen3_vl`, `smolvlm`, `llava_onevision` |
| Rodar em CPU / notebook simples | `smolvlm` (256M), `videomae` (87M) |
| Classificar ações (o que acontece no vídeo) | `timesformer`, `vivit`, `videomae` |
| Buscar vídeos por texto / zero-shot | `x_clip` |
| Segmentar/rastrear objetos | `sam2_video`, `sam3_video` |
| Vídeo **com áudio** (fala, som ambiente) | `qwen2_5_omni`, `qwen3_omni_moe`, `gemma4` |

## Se o modelo for *gated* ou tiver licença restrita

Repositórios *gated* exigem login e aprovação do autor:

```bash
hf auth login                      # usa um token com permissão de leitura
python utils/list_models.py --hub --include-gated --modality multimodal --limit 10
```

Alternativas sempre livres para as mesmas tarefas: `HuggingFaceTB/SmolVLM2-*` (Apache-2.0), `Qwen/Qwen2.5-VL-*`
(Apache-2.0), `llava-hf/*-hf` (Apache-2.0), `facebook/timesformer-*` (Apache-2.0) e `microsoft/xclip-*` (MIT).
