import { describe, expect, it } from "vitest";
import { isEchoed } from "./echoedText";

// Real RSS-bot rows: the note is headline + lede + link, and the link's Open
// Graph title/description are that headline and lede again.
const g1 = "Justiça solta homem que matou amiga para 'expulsar demônios' na Serra https://s2-g1.glbimg.com/x.jpg Justiça soltou Bryan https://g1.globo.com/es/noticia.ghtml";
const antagonista =
  "“Todos que apoiei venceram” na América Latina, diz Trump https://cdn.oantagonista.com/x.jpg O presidente dos Estados Unidos, Donald Trump, afirmou na terça, 22, que todos os candidatos que tiveram seu apoio em eleições na América Latina foram vitoriosos.";

describe("isEchoed", () => {
  it("a title the note already leads with, site suffix and all", () => {
    expect(isEchoed("Justiça solta homem que matou amiga para 'expulsar demônios' na Serra | G1", g1)).toBe(true);
    expect(isEchoed("\"Todos que apoiei venceram\" na América Latina, diz Trump", antagonista)).toBe(true);
  });

  it("a lightly rephrased headline still counts — accents and quotes don't matter", () => {
    const note = "Paciente é presa após agredir e xingar técnica de enfermagem de 'neguinha' dentro de PA em Vila Velha";
    expect(isEchoed("Mulher é presa após xingar técnica de enfermagem de 'neguinha' no ES | G1", note)).toBe(true);
  });

  it("a description the note doesn't say is kept", () => {
    expect(isEchoed("Presidente dos EUA afirmou estar \"nove em nove\"", antagonista)).toBe(false);
    expect(isEchoed("Bryan Fernando Gimenez Souza, de 26 anos, recebeu uma medida cautelar e não pode deixar o…", g1)).toBe(false);
  });

  it("a truncated lede the note carries in full is echoed", () => {
    expect(isEchoed("O presidente dos Estados Unidos, Donald Trump, afirmou na terça, 22, que todos os candidatos…", antagonista)).toBe(true);
  });

  it("nothing on screen means nothing is echoed; an empty snippet always is", () => {
    expect(isEchoed("Liverpool F.C.", "")).toBe(false);
    expect(isEchoed("", "anything")).toBe(true);
    expect(isEchoed(null, "anything")).toBe(true);
  });

  it("a note that only shares a word or two with the page is not an echo", () => {
    expect(isEchoed("Liverpool F.C. — Professional football club", "Watching the Liverpool game tonight")).toBe(false);
  });
});
