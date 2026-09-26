# G-Code

A ~110M-parameter language model for JavaScript, trained from scratch — the
seventh member of the G family (after [G-Micro](https://github.com/JerzySukiennik/g-micro)).

Type a description — "a jumping green sphere", "a 2d shooter", "skacząca kula" —
and G-Code writes the program live, next to your text, rewriting it as you type.

## How it works

1. **Pretraining** on filtered JavaScript and HTML from
   [codeparrot/github-code-clean](https://huggingface.co/datasets/codeparrot/github-code-clean)
   (Apache-2.0), with fill-in-the-middle on half the files, plus a little English
   and Polish prose.
2. **Instruction tuning** on synthetic description → program pairs generated
   from a grammar over a small game engine (`engine/`), in English and Polish.
   Every pair is executed before it is kept.
3. **Playground** (`web/`) streams generated code into an editor and runs it.

A 110M model cannot write arbitrary software. It can compose anything the
engine's building blocks can express, and that is what it is trained to do.

## Layout

| path | what |
|---|---|
| `model/` | the transformer (RoPE, RMSNorm, SwiGLU, KV cache) |
| `data/` | download, filter, tokenizer, packing |
| `train/` | pretraining / fine-tuning loops |
| `kaggle/` | kernels that run the above on free Kaggle GPUs |
| `engine/` | the game engine generated programs are written against |
| `synth/` | the description → program generator |
| `web/` | the live playground |
| `server/` | inference server |

MIT licensed.
