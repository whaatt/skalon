export type TagGlyph = "Glyph";
export type TagWord = "Word";
export type TagSentence = "Sentence";
export type TagParagraph = "Paragraph";
export type TagContainer = "Container";

export type TagAtomicTypes = TagGlyph;
export type TagSequenceTypes =
  | TagWord
  | TagSentence
  | TagParagraph
  | TagContainer;
export type TagTypes = TagAtomicTypes | TagSequenceTypes;

/**
 * A type constraint that ensures a type extends a single component of a
 * union type.
 */
type IsSingle<T, Allowed> = T extends Allowed
  ? [T] extends [Allowed]
    ? T
    : never
  : never;

/**
 * A type constraint that ensures proper hierarchy of nested sequence types.
 */
type TagHierarchy<Tag> = Tag extends IsSingle<Tag, TagSequenceTypes>
  ? {
      Container: TagParagraph;
      Paragraph: TagSentence;
      Sentence: TagWord;
      Word: TagGlyph;
    }[Tag]
  : never;

/**
 * A base type for all discrete text entities.
 */
type EntityBase<Tag extends TagTypes> = {
  [K in TagTypes]: {
    tag: Tag;
    isSequence: Tag extends TagSequenceTypes ? true : false;
    shouldIgnoreForMetrics: boolean;
    startTimestamp: number;
    endTimestamp: number | null;
    element: HTMLDivElement;

    resetStyle(): void;
    getDuration(): number | null;
    getInProgress(): boolean;
    transformWith(
      transformer: EntityTransformer,
      contextBase: EntityTransformerContextBase
    ): void;
  };
}[Tag];

/**
 * An atomic entity (any entity that is not a sequence).
 */
export type EntityAtomic = EntityBase<TagAtomicTypes>;

/**
 * Helper type to get the type of an entity for a given tag.
 */
export type EntityOf<Tag extends TagTypes> = Tag extends TagSequenceTypes
  ? EntitySequence<Tag>
  : EntityAtomic;

/**
 * Helper type to get the type of items for a given sequence tag.
 */
export type ItemsOf<Tag extends TagSequenceTypes> =
  TagHierarchy<Tag> extends TagSequenceTypes
    ? EntitySequence<TagHierarchy<Tag>>
    : EntityAtomic;

/**
 * A sequence of entities (itself an entity).
 */
export type EntitySequence<Tag extends TagSequenceTypes> = {
  [K in TagSequenceTypes]: EntityBase<Tag> & {
    items: ItemsOf<Tag>[];
    metrics: {
      averageGlyphInterval: number | null;
    };

    getDuration(): number;
    getInProgress(): boolean;
    addItem(item: ItemsOf<Tag>, forceWhileFinished?: boolean): void;
    getLastItem(): ItemsOf<Tag> | null;
    removeLastGlyphAndResumeNestedSequences(
      forceWhileFinished?: boolean
    ): boolean;
    finishGrouping(): void;
    resumeGrouping(): void;
  };
}[Tag];

/**
 * Union of all discrete entity sequence types.
 */
export type EntitySequences = {
  [K in TagSequenceTypes]: EntitySequence<K>;
}[TagSequenceTypes];

/**
 * Union of all discrete entity types (atomic or sequence).
 */
type Entity = EntityAtomic | EntitySequences;

/**
 * A base transformer context with time-related properties.
 */
type EntityTransformerContextBase = {
  timeDelta: number;
  timeElapsed: number;
  lastFrameTime: number;
};

/**
 * A transformer that can be applied to an entity.
 */
export type EntityTransformer = {
  transform(entity: Entity, contextBase: EntityTransformerContextBase): void;
};
