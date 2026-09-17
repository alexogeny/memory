PRAGMA foreign_keys = ON;
CREATE TABLE subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('person','place','animal','organization')));
INSERT INTO subjects VALUES ('self','Me','person');
CREATE TABLE records (
 id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id), category TEXT NOT NULL, attribute TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('fact','observation')), value TEXT NOT NULL CHECK(json_valid(value)), unit TEXT,
 observed_at TEXT, valid_from TEXT, valid_to TEXT, metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)), revision INTEGER NOT NULL CHECK(revision > 0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, retracted_at TEXT
);
CREATE UNIQUE INDEX one_active_fact ON records(subject_id,category,attribute) WHERE kind = 'fact' AND retracted_at IS NULL;
CREATE INDEX records_subject_category ON records(subject_id,category,id) WHERE retracted_at IS NULL;
CREATE TABLE record_history (record_id TEXT NOT NULL REFERENCES records(id), revision INTEGER NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('create','update','retract')), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_at TEXT NOT NULL, PRIMARY KEY(record_id,revision));
CREATE TRIGGER record_created AFTER INSERT ON records BEGIN
 INSERT INTO record_history VALUES (new.id,new.revision,'create',json_object('id',new.id,'subject_id',new.subject_id,'category',new.category,'attribute',new.attribute,'kind',new.kind,'value',json(new.value),'unit',new.unit,'observed_at',new.observed_at,'valid_from',new.valid_from,'valid_to',new.valid_to,'metadata',json(new.metadata),'revision',new.revision,'created_at',new.created_at,'updated_at',new.updated_at,'retracted_at',new.retracted_at),new.updated_at);
END;
CREATE TRIGGER record_updated AFTER UPDATE ON records BEGIN
 INSERT INTO record_history VALUES (new.id,new.revision,CASE WHEN new.retracted_at IS NULL THEN 'update' ELSE 'retract' END,json_object('id',new.id,'subject_id',new.subject_id,'category',new.category,'attribute',new.attribute,'kind',new.kind,'value',json(new.value),'unit',new.unit,'observed_at',new.observed_at,'valid_from',new.valid_from,'valid_to',new.valid_to,'metadata',json(new.metadata),'revision',new.revision,'created_at',new.created_at,'updated_at',new.updated_at,'retracted_at',new.retracted_at),new.updated_at);
END;
