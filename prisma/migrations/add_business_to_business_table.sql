-- CreateTable: Business to Business Relations
CREATE TABLE IF NOT EXISTS "ak_business_to_business" (
    "id_relation" SERIAL NOT NULL,
    "id_business_source" INTEGER,
    "id_business_related" INTEGER,
    "type" VARCHAR(100),
    "precisions" TEXT,
    "doublon" SMALLINT DEFAULT 0,

    CONSTRAINT "ak_business_to_business_pkey" PRIMARY KEY ("id_relation")
);

-- AddForeignKey
ALTER TABLE "ak_business_to_business" ADD CONSTRAINT "ak_business_to_business_id_business_source_fkey" 
FOREIGN KEY ("id_business_source") REFERENCES "ak_business"("id_business") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ak_business_to_business" ADD CONSTRAINT "ak_business_to_business_id_business_related_fkey" 
FOREIGN KEY ("id_business_related") REFERENCES "ak_business"("id_business") ON DELETE CASCADE ON UPDATE CASCADE;
