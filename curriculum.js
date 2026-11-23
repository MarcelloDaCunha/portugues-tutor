// Beginner -> fluent plan. Each lesson ~5 min (6 learner turns). "scenario" and "grammar" steer the AI.
const LEVELS = {
  A1: 'absolute beginner: very short, simple sentences, present tense, common words; the learner may answer in single words or English',
  A2: 'elementary: short sentences, present, near future (vou + infinitive), simple past (pretérito perfeito) introduced slowly',
  B1: 'intermediate: connected sentences, past tenses, future plans, opinions, simple subjunctive triggers',
  B2: 'upper-intermediate: natural speed vocabulary, subjunctive, conditionals, idioms, informal contractions (tá, né, pra)',
  C1: 'advanced: nuance, debate, humor, slang, regional expressions, near-native fluency; challenge the learner'
};

const LESSONS = [
  // ---- A1
  { id: 1, level: 'A1', title: 'Olá! Greetings', scenario: 'Meeting someone new at a café in São Paulo.', phrases: ['Oi, tudo bem?', 'Prazer em conhecer', 'Meu nome é...', 'Eu sou dos Estados Unidos'], grammar: 'ser (sou/é), greetings' },
  { id: 2, level: 'A1', title: 'Quem sou eu', scenario: 'Introducing yourself: name, nationality, job.', phrases: ['Eu sou...', 'Eu trabalho com...', 'Eu moro em...'], grammar: 'ser vs. morar/trabalhar, present tense eu' },
  { id: 3, level: 'A1', title: 'Pedindo café', scenario: 'Ordering coffee and a pão de queijo at a padaria.', phrases: ['Eu queria um café', 'Quanto custa?', 'Mais alguma coisa?', 'Só isso, obrigado'], grammar: 'queria, articles um/uma' },
  { id: 4, level: 'A1', title: 'Números e preços', scenario: 'Buying things at a market and asking prices.', phrases: ['Quanto é?', 'É muito caro', 'Tem desconto?'], grammar: 'numbers 1-100, é/custa' },
  { id: 5, level: 'A1', title: 'Minha família', scenario: 'Talking about family members with a new friend.', phrases: ['Eu tenho um irmão', 'Minha mãe se chama...', 'Ela tem... anos'], grammar: 'ter, possessives meu/minha' },
  { id: 6, level: 'A1', title: 'Gosto e não gosto', scenario: 'Talking about food and hobbies you like.', phrases: ['Eu gosto de...', 'Eu não gosto de...', 'Eu adoro...'], grammar: 'gostar de, negation não' },
  { id: 7, level: 'A1', title: 'Onde fica?', scenario: 'Asking a stranger for directions to the metro.', phrases: ['Onde fica o metrô?', 'Vire à direita', 'É perto daqui?'], grammar: 'estar/ficar for location, direita/esquerda' },
  { id: 8, level: 'A1', title: 'Meu dia', scenario: 'Describing a normal day to a coworker.', phrases: ['Eu acordo às...', 'Eu vou para o trabalho', 'À noite eu...'], grammar: 'regular -ar/-er/-ir present, telling time' },
  // ---- A2
  { id: 9, level: 'A2', title: 'No restaurante', scenario: 'Ordering a full meal and asking about ingredients at a restaurante.', phrases: ['Pode trazer a conta?', 'O que você recomenda?', 'Sem cebola, por favor'], grammar: 'pedir, poder, polite requests' },
  { id: 10, level: 'A2', title: 'Planos de fim de semana', scenario: 'Making weekend plans with a friend.', phrases: ['Vou ao cinema', 'Vamos à praia?', 'Que tal...?'], grammar: 'ir + infinitive (future), vamos' },
  { id: 11, level: 'A2', title: 'O que você fez?', scenario: 'Telling a friend what you did yesterday.', phrases: ['Ontem eu fui...', 'Eu comi...', 'Foi muito legal'], grammar: 'pretérito perfeito: fui, comi, fiz' },
  { id: 12, level: 'A2', title: 'Táxi e Uber', scenario: 'Taking an Uber, giving the address and chatting with the driver.', phrases: ['Pode me deixar aqui', 'Quanto tempo demora?', 'Tem como ir mais rápido?'], grammar: 'ter como, demorar, informal polite' },
  { id: 13, level: 'A2', title: 'Saúde', scenario: 'Telling a pharmacist or doctor what is wrong.', phrases: ['Estou com dor de...', 'Eu me sinto mal', 'Tem algum remédio para...?'], grammar: 'estar com, reflexive sentir-se' },
  { id: 14, level: 'A2', title: 'Compras e roupas', scenario: 'Shopping for clothes in a loja; sizes, colors, trying on.', phrases: ['Posso experimentar?', 'Tem um tamanho maior?', 'Fico com esse'], grammar: 'adjective agreement, demonstratives esse/este' },
  { id: 15, level: 'A2', title: 'Como era?', scenario: 'Describing your childhood and hometown.', phrases: ['Quando eu era criança...', 'Eu morava em...', 'Eu costumava...'], grammar: 'pretérito imperfeito' },
  { id: 16, level: 'A2', title: 'Ao telefone', scenario: 'Calling to book a hotel room or table.', phrases: ['Eu gostaria de reservar...', 'Para quantas pessoas?', 'Pode repetir, por favor?'], grammar: 'gostaria, conditional politeness' },
  // ---- B1
  { id: 17, level: 'B1', title: 'Contando uma história', scenario: 'Telling a funny story about a trip.', phrases: ['Então...', 'Aí', 'No final das contas'], grammar: 'pretérito perfeito vs. imperfeito' },
  { id: 18, level: 'B1', title: 'Opiniões', scenario: 'Discussing a movie or football game with a friend; agree and disagree.', phrases: ['Eu acho que...', 'Concordo / Discordo', 'Na minha opinião...'], grammar: 'opinion verbs, conjunctions porque/mas/porém' },
  { id: 19, level: 'B1', title: 'Planos e sonhos', scenario: 'Talking about future plans and goals.', phrases: ['Quando eu me mudar para o Brasil...', 'Espero que...', 'Eu pretendo...'], grammar: 'futuro, subjuntivo presente intro (espero que, quando)' },
  { id: 20, level: 'B1', title: 'Entrevista de emprego', scenario: 'Role-play a job interview in Portuguese.', phrases: ['Tenho experiência em...', 'Meu ponto forte é...', 'Estou disponível para...'], grammar: 'formal register, pretérito perfeito composto, você/o senhor' },
  { id: 21, level: 'B1', title: 'Resolvendo problemas', scenario: 'Complaining politely about a wrong order or hotel problem.', phrases: ['Houve um problema', 'Isso não é o que eu pedi', 'Poderia resolver isso?'], grammar: 'conditional, polite complaints' },
  { id: 22, level: 'B1', title: 'Se eu pudesse...', scenario: 'Hypothetical chat: what would you do if you won the lottery?', phrases: ['Se eu ganhasse...', 'Eu compraria...', 'Eu viajaria...'], grammar: 'imperfeito do subjuntivo + condicional' },
  // ---- B2
  { id: 23, level: 'B2', title: 'Papo de bar', scenario: 'Casual banter with Brazilian friends at a bar; gírias.', phrases: ['Tá ligado?', 'Nossa, que legal!', 'Pois é', 'Né?'], grammar: 'tá/né/pra contractions, interjections, informal tu vs você' },
  { id: 24, level: 'B2', title: 'Notícias e debate', scenario: 'Debating a current news topic respectfully.', phrases: ['Pelo contrário', 'Por um lado... por outro', 'É verdade, mas...'], grammar: 'subjuntivo em orações, connectors' },
  { id: 25, level: 'B2', title: 'Expressões idiomáticas', scenario: 'Learning and using Brazilian idioms in conversation.', phrases: ['Dar um jeito', 'Estar com a cabeça no mundo da lua', 'Ficar de boa'], grammar: 'idioms, colloquial verbs' },
  { id: 26, level: 'B2', title: 'Futuro do subjuntivo', scenario: 'Discussing conditions and promises about the future.', phrases: ['Quando eu chegar...', 'Se você quiser...', 'Assim que eu puder...'], grammar: 'futuro do subjuntivo' },
  // ---- C1
  { id: 27, level: 'C1', title: 'Cultura brasileira', scenario: 'Deep conversation about Brazilian music, football, Carnaval and regional differences.', phrases: ['Depende da região', 'Isso varia muito', 'No Nordeste...'], grammar: 'nuance, regionalisms' },
  { id: 28, level: 'C1', title: 'Humor e ironia', scenario: 'Joking around; understanding sarcasm and wordplay.', phrases: ['Tô brincando', 'Falando sério', 'Que isso, hein'], grammar: 'tone, register shifts' },
  { id: 29, level: 'C1', title: 'Argumentação', scenario: 'Defend a position on a social topic with structured arguments.', phrases: ['Em primeiro lugar', 'Além disso', 'Em suma'], grammar: 'discourse markers, mesóclise/ênclise basics' },
  { id: 30, level: 'C1', title: 'Conversa livre', scenario: 'Open conversation on a topic the learner picks; the tutor pushes for precision and naturalness.', phrases: [], grammar: 'whatever errors appear' }
];
